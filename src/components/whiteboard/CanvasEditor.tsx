import React, { useEffect, useRef, useState, useContext } from 'react';
import { fabric } from 'fabric'; 
import './FabricExtended'; 
import { RgbaStringColorPicker } from "react-colorful";
import Dropdown from './Dropdown';

// Icons
import ArrowIcon from './icons/ArrowIcon'; 
import CircleIcon from './icons/CircleIcon'; 
import EraseIcon from './icons/EraseIcon'; 
import ExportIcon from './icons/ExportIcon'; 
import FlopIcon from './icons/FlopIcon'; 
import GridIcon from './icons/GridIcon'; 
import HandIcon from './icons/HandIcon'; 
import ImageIcon from './icons/ImageIcon'; 
import JsonIcon from './icons/JsonIcon'; 
import LineIcon from './icons/LineIcon'; 
import PenIcon from './icons/PenIcon'; 
import RectIcon from './icons/RectIcon'; 
import UndoIcon from './icons/UndoIcon'; 
import StickyIcon from './icons/StickyIcon'; 
import TextIcon from './icons/TextIcon'; 
import TrashIcon from './icons/TrashIcon'; 
import TriangleIcon from './icons/TriangleIcon'; 
import RedoIcon from './icons/RedoIcon'; 
import GeometryIcon from './icons/GeometryIcon'; 
import CogIcon from './icons/CogIcon'; 

import './Whiteboard.css';
import { WhiteboardContext } from './WhiteboardStore';

interface IProps {
  className?: string;
  options?: object;
  onSync?: (json: any) => void; 
  syncData?: any; 
  readOnly?: boolean;
}

const bottomMenu = [
  { title: 'Grid', icon: <GridIcon /> },
  { title: 'Undo', icon: <UndoIcon /> },
  { title: 'Redo', icon: <RedoIcon /> },
  { title: 'Clear', icon: <TrashIcon /> },
  { title: 'Export', icon: <ExportIcon /> },
];

const toolbar = [
  { title: 'Select', icon: <HandIcon /> },
  { title: 'Draw', icon: <PenIcon /> },
  { title: 'Text', icon: <TextIcon /> },
  { title: 'Rect', icon: <RectIcon /> },
  { title: 'Circle', icon: <CircleIcon /> },
  { title: 'Arrow', icon: <ArrowIcon /> },
];

export function CanvasEditor({ className, options, onSync, syncData, readOnly }: IProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { gstate } = useContext(WhiteboardContext);
  const { canvasOptions, backgroundImage } = gstate;
  const [editor, setEditor] = useState<fabric.Canvas | null>(null);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const isInternalUpdate = useRef(false);

  // Initialize Canvas
  useEffect(() => {
    if (!canvasRef.current || !parentRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      ...canvasOptions,
      isDrawingMode: !readOnly,
      width: parentRef.current.clientWidth,
      height: parentRef.current.clientHeight,
    });

    setEditor(canvas);

    const handleResize = () => {
      canvas.setWidth(parentRef.current?.clientWidth || 0);
      canvas.setHeight(parentRef.current?.clientHeight || 0);
      canvas.renderAll();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.dispose();
    };
  }, []);

  // Handle Sync Data (Incoming from Jitsi/Socket)
  useEffect(() => {
    if (editor && syncData) {
      isInternalUpdate.current = true;
      editor.loadFromJSON(syncData, () => {
        editor.renderAll();
        isInternalUpdate.current = false;
      });
    }
  }, [syncData, editor]);

  // Handle Outgoing Sync (User draws something)
  useEffect(() => {
    if (!editor || !onSync) return;

    const pushChange = () => {
      if (isInternalUpdate.current) return;
      const json = editor.toDatalessJSON();
      onSync(json);
    };

    editor.on('object:added', pushChange);
    editor.on('object:modified', pushChange);
    editor.on('object:removed', pushChange);
    editor.on('path:created', pushChange);

    return () => {
      editor.off('object:added', pushChange);
      editor.off('object:modified', pushChange);
      editor.off('object:removed', pushChange);
      editor.off('path:created', pushChange);
    };
  }, [editor, onSync]);

  // Handle Tool Selection
  const onToolbar = (objName: string) => {
    if (!editor || readOnly) return;

    editor.isDrawingMode = false;

    if (objName === 'Select') {
      editor.discardActiveObject();
      editor.requestRenderAll();
      return;
    }

    if (objName === 'Draw') {
      editor.isDrawingMode = true;
      editor.freeDrawingBrush.width = 5;
      editor.freeDrawingBrush.color = 'black';
      return;
    }

    let obj: any;
    const center = editor.getCenter();

    switch (objName) {
      case 'Text':
        obj = new fabric.Textbox('Text', { left: center.left, top: center.top, fontSize: 20 });
        break;
      case 'Rect':
        obj = new fabric.Rect({ 
            left: center.left, 
            top: center.top, 
            width: 100, 
            height: 100, 
            fill: 'transparent', 
            stroke: 'black', 
            strokeWidth: 2 
        });
        break;
      case 'Circle':
        obj = new fabric.Circle({ 
            left: center.left, 
            top: center.top, 
            radius: 50, 
            fill: 'transparent', 
            stroke: 'black', 
            strokeWidth: 2 
        });
        break;
      case 'Arrow':
        // Fixed: Added robust Arrow implementation using Path
        obj = new fabric.Path('M 0 0 L 100 0 M 90 -10 L 100 0 L 90 10', {
            left: center.left,
            top: center.top,
            stroke: 'black',
            strokeWidth: 2,
            fill: 'transparent'
        });
        break;
    }

    if (obj) {
      editor.add(obj);
      editor.setActiveObject(obj);
    }
  };

  const onBottomMenu = (action: string) => {
    if (!editor) return;
    switch (action) {
      case 'Clear':
        if(confirm("Clear board?")) {
            editor.clear();
            editor.fire('object:modified'); // Trigger sync
        }
        break;
      case 'Undo':
        // @ts-ignore
        if (editor.undo) editor.undo();
        break;
      case 'Redo':
        // @ts-ignore
        if (editor.redo) editor.redo();
        break;
      case 'Grid':
        setShowGrid(!showGrid);
        break;
    }
  };

  return (
    <div 
      className={`w-100 h-100 whiteboard ${className}`} 
      style={{ backgroundImage: showGrid ? backgroundImage : '', position: 'relative' }} 
      ref={parentRef}
    >
      
      {/* Top Toolbar */}
      {!readOnly && (
        <div className='d-flex justify-center align-center' style={{ position: 'absolute', top: '10px', left: 0, right: 0, zIndex: 100 }}>
          <div className='bg-white d-flex shadow br-7'>
            {toolbar.map(item => (
              <button key={item.title} onClick={() => onToolbar(item.title)} title={item.title}>{item.icon}</button>
            ))}
          </div>
        </div>
      )}

      <canvas ref={canvasRef} />

      {/* Bottom Toolbar */}
      <div className='bottom-menu' style={{ position: 'absolute', bottom: '10px', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 100 }}>
        <div className='d-flex bg-white br-7 shadow'>
          {bottomMenu.map(item => (
            <button key={item.title} onClick={() => onBottomMenu(item.title)} title={item.title}>{item.icon}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
