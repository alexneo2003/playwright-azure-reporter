/* eslint-disable no-unused-vars */

export function setHeaders(response, headers) {
  const head = {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const [i, _] of headers.entries()) {
    if (i % 2 === 0)
      head[headers[i]] = headers[i + 1];

  }
  for (const [key, value] of Object.entries(head))
    response.setHeader(key, value);

}

export async function getRequestBody(req: import('http').IncomingMessage & { postBody: Promise<Buffer>; }) {
  return req.postBody.then(body => body.toString('utf-8')).then(body => JSON.parse(body));
}