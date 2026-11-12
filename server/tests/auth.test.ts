import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JWT_AUDIENCE, JWT_ISSUER } from '../src/middleware/auth';
import { User } from '../src/modules/users/user.model';
import { PASSWORD, api, bearer, makeUser, makeWorld } from './helpers/factory';

const register = (body: Record<string, unknown>) => api().post('/api/v1/auth/register').send(body);
const cookieOf = (res: { headers: Record<string, unknown> }) => (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];

describe('registration', () => {
  it('creates a passenger, returns a token and never exposes the password hash', async () => {
    const res = await register({ name: 'Asha Rao', email: 'Asha@Example.com', phone: '9876543210', password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'asha@example.com', role: 'PASSENGER' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/bn_refresh=/);
    expect(cookie).toMatch(/HttpOnly/i);

    const stored = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored!.passwordHash).not.toBe(PASSWORD);
    expect(stored!.passwordHash).toMatch(/^\$2/);
  });

  it('ignores a client-supplied role (no privilege escalation)', async () => {
    const res = await register({ name: 'Sneaky Admin', email: 'sneaky@example.com', password: PASSWORD, role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('PASSENGER');
  });

  it('rejects a duplicate email with 409', async () => {
    await register({ name: 'First User', email: 'dupe@example.com', password: PASSWORD });
    const res = await register({ name: 'Second User', email: 'DUPE@example.com', password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('rejects invalid input with field-level errors', async () => {
    const res = await register({ name: 'A', email: 'not-an-email', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('login', () => {
  it('signs in with valid credentials', async () => {
    const user = await makeUser('PASSENGER');
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user._id).toBe(user.id);
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const user = await makeUser('PASSENGER');
    const wrong = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Wrong@1234' });
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: PASSWORD });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('rejects a deactivated account', async () => {
    const user = await makeUser('PASSENGER');
    await User.updateOne({ _id: user.id }, { isActive: false });
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('blocks NoSQL operator injection in credentials', async () => {
    await makeUser('PASSENGER');
    const res = await api().post('/api/v1/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } });
    expect(res.status).toBe(400);
  });
});

describe('tokens', () => {
  it('rejects requests without a token', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token and a token signed with another secret', async () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'some-other-secret-that-is-long-enough-000', { subject: '665f1c2e9b1e8a0012a4c001', issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    for (const token of ['garbage.token.value', forged]) {
      const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_INVALID');
    }
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const user = await makeUser('PASSENGER');
    const expired = jwt.sign({ role: 'PASSENGER' }, process.env.JWT_SECRET!, { subject: user.id, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: -10 });
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rotates refresh tokens and revokes the session on logout', async () => {
    const user = await makeUser('PASSENGER');
    const login = await api().post('/api/v1/auth/login').send({ email: user.email, password: PASSWORD });
    const first = cookieOf(login);

    const refreshed = await api().post('/api/v1/auth/refresh').set('Cookie', first);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));
    const second = cookieOf(refreshed);
    expect(second).not.toBe(first);

    // The rotated-out token no longer works.
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', first)).status).toBe(401);

    expect((await api().post('/api/v1/auth/logout').set('Cookie', second)).status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', second)).status).toBe(401);
  });

  it('rejects refresh without a cookie', async () => {
    const res = await api().post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});

describe('role-based access', () => {
  it('keeps passengers out of admin and staff endpoints', async () => {
    const passenger = await makeUser('PASSENGER');
    for (const path of ['/api/v1/users', '/api/v1/operators', '/api/v1/buses', '/api/v1/reports/dashboard', '/api/v1/audit', '/api/v1/bookings']) {
      const res = await api().get(path).set(bearer(passenger));
      expect(res.status, path).toBe(403);
    }
  });

  it('keeps operators out of admin-only actions', async () => {
    const world = await makeWorld();
    const create = await api().post('/api/v1/operators').set(bearer(world.operatorUser)).send({ name: 'Rogue Lines', code: 'ROGUE', contactEmail: 'r@example.com', contactPhone: '0801234567' });
    expect(create.status).toBe(403);
    expect((await api().get('/api/v1/users').set(bearer(world.operatorUser))).status).toBe(403);
    expect((await api().get('/api/v1/audit').set(bearer(world.operatorUser))).status).toBe(403);
  });

  it('prevents staff from booking as passengers', async () => {
    const world = await makeWorld();
    const res = await api().post('/api/v1/bookings').set(bearer(world.admin)).set('Idempotency-Key', 'admin-key-12345').send({});
    expect(res.status).toBe(403);
  });

  it("confines an operator to their own operator's resources", async () => {
    const mine = await makeWorld();
    const theirs = await makeWorld();

    const list = await api().get('/api/v1/buses').set(bearer(mine.operatorUser));
    expect(list.status).toBe(200);
    expect(list.body.data.map((b: { _id: string }) => b._id)).toEqual([mine.busId]);

    expect((await api().get(`/api/v1/buses/${theirs.busId}`).set(bearer(mine.operatorUser))).status).toBe(403);
    expect((await api().get(`/api/v1/trips/${theirs.tripId}/manifest`).set(bearer(mine.operatorUser))).status).toBe(403);
    expect((await api().patch(`/api/v1/trips/${theirs.tripId}`).set(bearer(mine.operatorUser)).send({ baseFare: 1 })).status).toBe(403);
    // Even passing another operator's id in the query does not widen the scope.
    const scoped = await api().get(`/api/v1/buses?operatorId=${theirs.operatorId}`).set(bearer(mine.operatorUser));
    expect(scoped.body.data.map((b: { _id: string }) => b._id)).toEqual([mine.busId]);
  });

  it('lets an admin create operators and buses and records an audit entry', async () => {
    const admin = await makeUser('ADMIN');
    const operator = await api().post('/api/v1/operators').set(bearer(admin)).send({ name: 'Skyline Coaches', code: 'SKY', contactEmail: 'ops@skyline.example.com', contactPhone: '08044556677' });
    expect(operator.status).toBe(201);

    const bus = await api()
      .post('/api/v1/buses')
      .set(bearer(admin))
      .send({ operatorId: operator.body.data._id, name: 'Skyline Sleeper', registrationNumber: 'KA05ZZ9090', layout: { template: 'SLEEPER_2X1', rows: 5 } });
    expect(bus.status).toBe(201);
    expect(bus.body.data.seats).toHaveLength(30); // 5 rows x 3 berths x 2 decks
    expect(bus.body.data.busType).toBe('SLEEPER');

    const audit = await api().get('/api/v1/audit?entityType=Bus').set(bearer(admin));
    expect(audit.body.data.some((a: { action: string }) => a.action === 'BUS_CREATED')).toBe(true);
  });
});
