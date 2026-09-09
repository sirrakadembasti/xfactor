import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

const workersByLanguage = {
  css: CssWorker,
  less: CssWorker,
  scss: CssWorker,
  html: HtmlWorker,
  handlebars: HtmlWorker,
  razor: HtmlWorker,
  json: JsonWorker,
  typescript: TsWorker,
  javascript: TsWorker
};

// @monaco-editor/react otherwise loads the AMD editor from a CDN. Supplying the
// Vite-bundled ESM instance keeps editor and language workers same-origin.
globalThis.MonacoEnvironment = {
  ...(globalThis.MonacoEnvironment || {}),
  getWorker(_moduleId, label) {
    const WorkerConstructor = workersByLanguage[label] || EditorWorker;
    return new WorkerConstructor();
  }
};

loader.config({ monaco });

export { monaco };
