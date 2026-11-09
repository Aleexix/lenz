// Paths inside monaco-editor's ESM build (see the alias in electron.vite.config.ts).
declare module 'monaco-editor-esm/editor/editor.api.js' {
  export * from 'monaco-editor'
}
declare module 'monaco-editor-esm/editor/editor.worker.js?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
declare module 'monaco-editor-esm/*'
