interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetsBinding;
}

declare const worker: {
  fetch(request: Request, environment: WorkerEnvironment): Promise<Response>;
};

export default worker;
