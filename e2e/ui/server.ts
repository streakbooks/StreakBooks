// Browser fixtures never execute server-only request helpers.
export function getRequest(): Request {
  return new Request("http://127.0.0.1:8100/");
}

export function getRequestHeader(_name: string): string | undefined {
  return undefined;
}

export function setResponseHeader(_name: string, _value: string): void {
  // No response headers are needed by the public UI fixtures.
}
