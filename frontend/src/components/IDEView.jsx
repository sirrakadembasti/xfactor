import React from 'react';
import Editor from '@monaco-editor/react';
import { FileCode } from 'lucide-react';
import '../monacoSetup.js';

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const isTextEncoding = encoding => ['utf8', 'utf-8'].includes(String(encoding || '').toLowerCase());
const isBase64 = content => (
  typeof content === 'string'
  && content.length % 4 === 0
  && /^[A-Za-z0-9+/]*={0,2}$/.test(content)
);

function languageForPath(filePath = '') {
  const path = String(filePath).toLowerCase();
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.prisma')) return 'graphql';
  if (path.endsWith('.sql')) return 'sql';
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  return 'javascript';
}

function BinaryPreview({ file }) {
  const extension = `.${String(file.path || '').split('.').pop().toLowerCase()}`;
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (file.encoding === 'base64' && mimeType && isBase64(file.content)) {
    return (
      <div className="flex h-full items-center justify-center overflow-auto bg-[#1e1e1e] p-6">
        <img
          src={`data:${mimeType};base64,${file.content}`}
          alt={`${file.path} görsel önizlemesi`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex h-full items-center justify-center p-8 text-center text-sm text-gray-400">
      <span>
        <strong className="block text-gray-200">Binary dosya önizlenemiyor</strong>
        <span className="mt-2 block">
          {file.path} güvenlik nedeniyle metin olarak yorumlanmıyor ({file.size ?? file.content?.length ?? 0} byte).
        </span>
      </span>
    </div>
  );
}

export default function IDEView({
  projectFiles = [],
  activeFile,
  setActiveFile
}) {
  const textFile = activeFile && isTextEncoding(activeFile.encoding);
  const contentLength = activeFile
    ? (textFile ? String(activeFile.content || '').length : (activeFile.size ?? 0))
    : 0;

  return (
    <div className="flex-1 flex">
      <div className="w-64 bg-gray-50 border-r flex flex-col">
        <div className="p-3 font-bold text-xs border-b bg-gray-200 text-gray-700 uppercase tracking-wide">
          Üretilen Dosyalar ({projectFiles.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {projectFiles.map((file, index) => (
            <button
              key={`${file.path}-${index}`}
              type="button"
              onClick={() => setActiveFile(file)}
              aria-pressed={activeFile?.path === file.path}
              className={`w-full text-left p-2.5 text-xs cursor-pointer border-b truncate hover:bg-indigo-50 flex items-center gap-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                activeFile?.path === file.path
                  ? 'bg-indigo-100 font-semibold border-l-4 border-indigo-600 text-indigo-900'
                  : 'text-gray-700'
              }`}
            >
              <FileCode
                size={15}
                aria-hidden="true"
                className={activeFile?.path === file.path ? 'text-indigo-600 shrink-0' : 'text-gray-400 shrink-0'}
              />
              <span className="truncate">{file.path}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-[#1e1e1e] flex flex-col">
        {activeFile ? (
          <>
            <div className="bg-[#252526] text-gray-300 px-4 py-2 text-xs border-b border-[#333] flex items-center justify-between">
              <span className="font-mono text-indigo-300">{activeFile.path}</span>
              <span className="text-[11px] text-gray-500">{contentLength} {textFile ? 'karakter' : 'byte'}</span>
            </div>
            <div className="flex-1 min-h-0">
              {textFile ? (
                <Editor
                  height="100%"
                  language={languageForPath(activeFile.path)}
                  theme="vs-dark"
                  value={String(activeFile.content || '')}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    ariaLabel: `${activeFile.path} salt okunur kaynak dosyası`
                  }}
                />
              ) : (
                <BinaryPreview file={activeFile} />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-gray-500 text-sm">
            Görüntülemek için soldan bir dosya seçin.
          </div>
        )}
      </div>
    </div>
  );
}
