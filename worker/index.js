const worker = {
  async fetch(request, environment) {
    const response = await environment.ASSETS.fetch(request);

    if (response.status !== 404 || !['GET', 'HEAD'].includes(request.method)) {
      return response;
    }

    const url = new URL(request.url);
    url.pathname = '/index.html';

    return environment.ASSETS.fetch(new Request(url, request));
  },
};

export default worker;
