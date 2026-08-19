import React from 'react';
import Editor from '@monaco-editor/react';
import { FileCode } from 'lucide-react';

export default function IDEView({
  projectFiles,
  activeFile,
  setActiveFile
}) {
  return (
    <div className="flex-1 flex">
      {/* Left File Tree */}
      <div className="w-64 bg-gray-50 border-r flex flex-col">
        <div className="p-3 font-bold text-xs border-b bg-gray-200 text-gray-700 uppercase tracking-wide">
          Üretilen Dosyalar ({projectFiles.length})
        </div>
        <div className="flex-1 overflow-y-auto">
          {projectFiles.map((f, i) => (
            <div
              key={i}
              onClick={() => setActiveFile(f)}
              className={`p-2.5 text-xs cursor-pointer border-b truncate hover:bg-indigo-50 flex items-center gap-2.5 transition-colors ${
                activeFile?.path === f.path
                  ? 'bg-indigo-100 font-semibold border-l-4 border-indigo-600 text-indigo-900'
                  : 'text-gray-700'
              }`}
            >
              <FileCode
                size={15}
                className={activeFile?.path === f.path ? 'text-indigo-600 shrink-0' : 'text-gray-400 shrink-0'}
              />
              <span className="truncate">{f.path}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monaco Editor Pane */}
      <div className="flex-1 bg-[#1e1e1e] flex flex-col">
        {activeFile ? (
          <>
            <div className="bg-[#252526] text-gray-300 px-4 py-2 text-xs border-b border-[#333] flex items-center justify-between">
              <span className="font-mono text-indigo-300">{activeFile.path}</span>
              <span className="text-[11px] text-gray-500">{activeFile.content.length} karakter</span>
            </div>
            <div className="flex-1">
              <Editor
                height="100%"
                language={
                  activeFile.path.endsWith('.json')
                    ? 'json'
                    : activeFile.path.endsWith('.md')
                    ? 'markdown'
                    : activeFile.path.endsWith('.css')
                    ? 'css'
                    : activeFile.path.endsWith('.html')
                    ? 'html'
                    : activeFile.path.endsWith('.prisma')
                    ? 'graphql'
                    : activeFile.path.endsWith('.sql')
                    ? 'sql'
                    : activeFile.path.endsWith('.ts') || activeFile.path.endsWith('.tsx')
                    ? 'typescript'
                    : 'javascript'
                }
                theme="vs-dark"
                value={activeFile.content}
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
              />
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
