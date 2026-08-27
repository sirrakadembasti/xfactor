import React from 'react';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';

export default function DAGFlowView({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange
}) {
  return (
    <div className="flex-1 flex flex-col h-full relative bg-slate-900/95 overflow-hidden">
      {/* Ajan Renk ve Rol Açıklama Göstergesi (Visual Legend) */}
      <div className="absolute top-4 right-4 z-10 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-xl px-4 py-2.5 text-[11px] text-gray-300 flex flex-wrap items-center gap-3.5 shadow-lg pointer-events-none">
        <span className="font-semibold text-white">Roller:</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block shadow-[0_0_8px_#3b82f6]"></span> 🏛️ Manager</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_#10b981]"></span> 📁 Director</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-[0_0_8px_#f59e0b]"></span> 📋 Teamleader</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block shadow-[0_0_8px_#0ea5e9]"></span> 💻 Coder</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block shadow-[0_0_8px_#8b5cf6]"></span> 🔍 Reviewer</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block shadow-[0_0_8px_#14b8a6]"></span> 🧪 Tester</span>
      </div>

      {/* React Flow Grafiği */}
      <div className="flex-1 w-full h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.2}
          maxZoom={1.5}
          nodesDraggable={true}
          nodesConnectable={false}
        >
          <Background color="#334155" gap={18} size={1.2} />
          <Controls className="bg-slate-800 border-slate-700 fill-white text-white shadow-md" />
        </ReactFlow>
      </div>
    </div>
  );
}
