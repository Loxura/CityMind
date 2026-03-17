/// <reference types="vite/client" />

// Vite ?worker suffix: import returns a Worker constructor
declare module '*?worker' {
  const WorkerCtor: new () => Worker;
  export default WorkerCtor;
}
