import { type Node } from '@xyflow/react';

export type NodeData = {
  label: string;
  kind?: string;
  meta?: Record<string, any>;
};

export type MindMapNode = Node<NodeData, 'mindmap'>;
