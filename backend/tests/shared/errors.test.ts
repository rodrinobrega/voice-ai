import {
  errorToResponse,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UpstreamServiceError,
  ValidationError,
} from '../../src/shared/errors';

describe('shared/errors — errorToResponse', () => {
  it.each([
    [new ValidationError('bad input'), 400, 'bad input'],
    [new UnauthorizedError(), 401, 'Unauthorized'],
    [new UnauthorizedError('bad secret'), 401, 'bad secret'],
    [new ForbiddenError(), 403, 'Forbidden'],
    [new NotFoundError('gone'), 404, 'gone'],
    [new UpstreamServiceError('speechmatics down'), 502, 'speechmatics down'],
  ])('maps %p to statusCode %i with message %p', (error, statusCode, message) => {
    const response = errorToResponse(error);
    expect(response.statusCode).toBe(statusCode);
    expect(JSON.parse(response.body)).toEqual({ message });
  });

  it('maps a plain Error (unexpected/unhandled) to a generic 500 without leaking its message', () => {
    const response = errorToResponse(new Error('leaked stack trace details'));
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ message: 'Internal server error' });
  });

  it('maps a non-Error thrown value (e.g. a string) to a generic 500', () => {
    const response = errorToResponse('something went wrong');
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ message: 'Internal server error' });
  });

  it('maps undefined/null thrown values to a generic 500', () => {
    expect(errorToResponse(undefined).statusCode).toBe(500);
    expect(errorToResponse(null).statusCode).toBe(500);
  });

  it('always returns the JSON content-type header', () => {
    const response = errorToResponse(new NotFoundError());
    expect(response.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});

describe('shared/errors — error hierarchy', () => {
  it('every typed error is an instance of Error and carries the right name', () => {
    const error = new ForbiddenError('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ForbiddenError');
    expect(error.statusCode).toBe(403);
  });
});
