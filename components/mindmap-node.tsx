import { useEffect, useRef } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';

import useStore from '../lib/store';
import { type MindMapNode } from '../lib/types';

function MindMapNode({ id, data }: NodeProps<MindMapNode>) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const updateNodeLabel = useStore((state) => state.updateNodeLabel);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 1);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const adjustHeight = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };

    adjustHeight();
    el.addEventListener("input", adjustHeight);
    return () => el.removeEventListener("input", adjustHeight);
  }, []);


  return (
    <>
      <div className="inputWrapper">
        <div className="dragHandle">
        </div>
        <textarea
          value={data.label}
          onChange={(evt) => updateNodeLabel(id, evt.target.value)}
          className="input nodrag"
          ref={inputRef}
          rows={1}
        />
      </div>

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Top} />
    </>
  );
}

export default MindMapNode;