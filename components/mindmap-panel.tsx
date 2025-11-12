import { ReactFlow, ReactFlowProvider, Controls, Panel, NodeOrigin, OnConnectStart, OnConnectEnd , useStoreApi, useReactFlow, InternalNode } from '@xyflow/react';
import { useRef, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { fetchMindMapData } from "@/app/actions/mindmap"
import { useEffect } from "react"

import useStore, { RFState } from '../lib/store';
import '../styles/mindmap.css';
 
import '@xyflow/react/dist/style.css';
import MindMapNode from './mindmap-node';
import MindMapEdge from './mindmap-edge';
 
const selector = (state: RFState) => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  addChildNode: state.addChildNode,
});

const nodeTypes = {
  mindmap: MindMapNode,
};
const edgeTypes = {
  mindmap: MindMapEdge,
};
 
const nodeOrigin: NodeOrigin = [0.5, 0.5];
 
function MindMapPanel() {
  const store = useStoreApi();

  const { setNodes, setEdges } = useStore()
    useEffect(() => {
    async function loadData() {
      const result = await fetchMindMapData()
      if (result.error) {
        console.error(result.error)
        return
      }
      if (result.data) {
        setNodes(result.data.nodes)
        setEdges(result.data.edges)
      }
    }
    loadData()
  }, [setNodes, setEdges])

  const { nodes, edges, onNodesChange, onEdgesChange, addChildNode } = useStore(selector, shallow);
  const { screenToFlowPosition } = useReactFlow();

  const connectingNodeId = useRef<string | null>(null);

  const onConnectStart: OnConnectStart = useCallback((_, { nodeId }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const getChildNodePosition = (event: MouseEvent, parentNode?: InternalNode) => {
    const { domNode } = store.getState();
  
    if (
      !domNode ||
      !parentNode?.internals.positionAbsolute ||
      !parentNode?.measured.width ||
      !parentNode?.measured.height
    ) {
      return;
    }
  
    const panePosition = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
  
    return {
      x:
        panePosition.x -
        parentNode.internals.positionAbsolute.x +
        parentNode.measured.width / 2,
      y:
        panePosition.y -
        parentNode.internals.positionAbsolute.y +
        parentNode.measured.height / 2,
    };
  };
 

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const { nodeLookup } = store.getState();
      const targetIsPane = (event.target as Element).classList.contains('react-flow__pane');
      const node = (event.target as Element).closest('.react-flow__node');
  
      if (node) {
        node.querySelector('input')?.focus({ preventScroll: true });
      } else if (targetIsPane && connectingNodeId.current) {
        const parentNode = nodeLookup.get(connectingNodeId.current);
        const childNodePosition = getChildNodePosition(event, parentNode);
  
        if (parentNode && childNodePosition) {
          addChildNode(parentNode, childNodePosition);
        }
      }
    },
    [getChildNodePosition],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeOrigin={nodeOrigin}
      fitView
    >
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function FlowWithProvider() {
  return (
    <ReactFlowProvider>
      <MindMapPanel />
    </ReactFlowProvider>
  );
}
 
export default FlowWithProvider;