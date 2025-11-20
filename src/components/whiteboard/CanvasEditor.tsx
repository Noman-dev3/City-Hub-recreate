// components/whiteboard/EnhancedCanvasEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { RgbaStringColorPicker } from "react-colorful";
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { useFirestore } from '@/firebase';
import Dropdown from './Dropdown';
import ArrowIcon from './icons/ArrowIcon';
import CircleIcon from './icons/CircleIcon';
import EraseIcon from './icons/EraseIcon';
import ExportIcon from './icons/ExportIcon';
import FlopIcon from './icons/FlopIcon';
import GridIcon from './icons/GridIcon';
import HandIcon from './icons/HandIcon';
import ImageIcon from './icons/ImageIcon';
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

interface IProps {
  className?: string;
  options?: object;
  classId: string;
  isTeacher: boolean;
  userId: string;
}

const bottomMenu = [
  { title: 'Show Object Options', icon: <CogIcon /> },
  { title: 'Grid', icon: <GridIcon /> },
  { title: 'Erase', icon: <EraseIcon /> },
  { title: 'Undo', icon: <UndoIcon /> },
  { title: 'Redo', icon: <RedoIcon /> },
  { title: 'Save', icon: <FlopIcon /> },
  { title: 'Export', icon: <ExportIcon /> },
  { title: 'Clear', icon: <TrashIcon /> }
];

const toolbar = [
  { title: 'Select', icon: <HandIcon /> },
  { title: 'Draw', icon: <PenIcon /> },
  { title: 'Text', icon: <TextIcon /> },
  { title: 'Sticky', icon: <StickyIcon /> },
  { title: 'Arrow', icon: <ArrowIcon /> },
  { title: 'Line', icon: <LineIcon /> }
];

// Shape auto-correction helper
function recognizeShape(path: fabric.Path): fabric.Object | null {
  const points = path.path;
  if (!points || points.length < 10) return null;

  const bounds = path.getBoundingRect();
  const width = bounds.width;
  const height = bounds.height;
  const aspectRatio = width / height;

  // Circle detection (aspect ratio close to 1)
  if (aspectRatio > 0.8 && aspectRatio < 1.2) {
    const radius = Math.max(width, height) / 2;
    return new fabric.Circle({
      radius,
      left: bounds.left,
      top: bounds.top,
      stroke: path.stroke,
      strokeWidth: path.strokeWidth,
      fill: 'transparent'
    });
  }

  // Rectangle detection (4 corners)
  if (aspectRatio > 0.3 && aspectRatio < 3) {
    return new fabric.Rect({
      width,
      height,
      left: bounds.left,
      top: bounds.top,
      stroke: path.stroke,
      strokeWidth: path.strokeWidth,
      fill: 'transparent'
    });
  }

  // Triangle detection (3 corners, tall shape)
  if (aspectRatio > 0.6 && aspectRatio < 1.4 && height > width * 0.7) {
    return new fabric.Triangle({
      width,
      height,
      left: bounds.left,
      top: bounds.top,
      stroke: path.stroke,
      strokeWidth: path.strokeWidth,
      fill: 'transparent'
    });
  }

  return null;
}

export function CanvasEditor({ className, options, classId, isTeacher, userId }: IProps) {
  const parentRef = useRef<any>();
  const canvasRef = useRef<any>();
  const firestore = useFirestore();

  const [editor, setEditor] = useState<fabric.Canvas | null>(null);
  const [objOptions, setObjOptions] = useState({
    stroke: '#000000',
    fontSize: 22,
    fill: 'rgba(255, 255, 255, 0.0)',
    strokeWidth: 3,
    ...options
  });

  const [colorProp, setColorProp] = useState<string>('stroke');
  const [showObjOptions, setShowObjOptions] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Debounced Firebase save
  const saveToFirebase = useCallback(
    debounce(async (canvasData: any) => {
      if (!firestore || !isTeacher || isUpdating) return;
      
      try {
        await setDoc(
          doc(firestore, 'classes', classId, 'whiteboard', 'current'),
          {
            canvasData,
            updatedBy: userId,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to save whiteboard:', err);
      }
    }, 500),
    [firestore, classId, userId, isTeacher, isUpdating]
  );

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !parentRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      selectionLineWidth: 2,
      isDrawingMode: false,
      ...options
    });

    // Add undo/redo support
    let historyUndo: any[] = [];
    let historyRedo: any[] = [];
    let historyProcessing = false;

    const saveHistory = () => {
      if (historyProcessing) return;
      historyUndo.push(JSON.stringify(canvas.toJSON()));
      if (historyUndo.length > 50) historyUndo.shift();
    };

    canvas.on('object:added', saveHistory);
    canvas.on('object:modified', saveHistory);
    canvas.on('object:removed', saveHistory);

    // Shape auto-correction on path creation
    canvas.on('path:created', (e: any) => {
      const path = e.path as fabric.Path;
      const recognizedShape = recognizeShape(path);
      
      if (recognizedShape && canvas.isDrawingMode) {
        canvas.remove(path);
        canvas.add(recognizedShape);
        canvas.renderAll();
      }
    });

    // Undo/Redo methods
    (canvas as any).undo = () => {
      if (historyUndo.length === 0) return;
      historyProcessing = true;
      const current = JSON.stringify(canvas.toJSON());
      historyRedo.push(current);
      const previous = historyUndo.pop();
      canvas.loadFromJSON(previous, () => {
        canvas.renderAll();
        historyProcessing = false;
      });
    };

    (canvas as any).redo = () => {
      if (historyRedo.length === 0) return;
      historyProcessing = true;
      const current = JSON.stringify(canvas.toJSON());
      historyUndo.push(current);
      const next = historyRedo.pop();
      canvas.loadFromJSON(next, () => {
        canvas.renderAll();
        historyProcessing = false;
      });
    };

    canvas.setHeight(parentRef.current.clientHeight);
    canvas.setWidth(parentRef.current.clientWidth);
    canvas.renderAll();

    setEditor(canvas);

    // Keyboard shortcuts
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Delete') {
        const activeObject = canvas.getActiveObject();
        if (activeObject) canvas.remove(activeObject);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        (canvas as any).undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        (canvas as any).redo();
      }
    };

    document.addEventListener('keydown', handleKeydown);

    return () => {
      canvas.dispose();
      document.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  // Firebase real-time sync
  useEffect(() => {
    if (!firestore || !editor || !classId) return;

    const unsubscribe = onSnapshot(
      doc(firestore, 'classes', classId, 'whiteboard', 'current'),
      (snapshot) => {
        if (!snapshot.exists()) return;
        
        const data = snapshot.data();
        if (data.updatedBy === userId) return; // Skip own updates

        setIsUpdating(true);
        editor.loadFromJSON(data.canvasData, () => {
          editor.renderAll();
          setIsUpdating(false);
        });
      }
    );

    return () => unsubscribe();
  }, [firestore, editor, classId, userId]);

  // Save to Firebase when teacher modifies
  useEffect(() => {
    if (!editor || !isTeacher) return;

    const handleChange = () => {
      const canvasData = editor.toJSON();
      saveToFirebase(canvasData);
    };

    editor.on('object:added', handleChange);
    editor.on('object:modified', handleChange);
    editor.on('object:removed', handleChange);

    return () => {
      editor.off('object:added', handleChange);
      editor.off('object:modified', handleChange);
      editor.off('object:removed', handleChange);
    };
  }, [editor, isTeacher, saveToFirebase]);

  const onToolbar = (objName: string) => {
    if (!editor) return;

    let objType: fabric.Object | null = null;

    switch (objName) {
      case 'Select':
        editor.isDrawingMode = false;
        editor.discardActiveObject().renderAll();
        break;

      case 'Draw':
        editor.isDrawingMode = true;
        editor.freeDrawingBrush.width = objOptions.strokeWidth;
        editor.freeDrawingBrush.color = objOptions.stroke;
        break;

      case 'Text':
        editor.isDrawingMode = false;
        objType = new fabric.Textbox('Your text here', { fontSize: objOptions.fontSize });
        break;

      case 'Circle':
        editor.isDrawingMode = false;
        objType = new fabric.Circle({ ...objOptions, radius: 70 });
        break;

      case 'Rect':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ ...objOptions, width: 100, height: 100 });
        break;

      case 'Triangle':
        editor.isDrawingMode = false;
        objType = new fabric.Triangle({ ...objOptions, width: 100, height: 100 });
        break;

      case 'Arrow':
        editor.isDrawingMode = false;
        const triangle = new fabric.Triangle({
          ...objOptions,
          width: 10,
          height: 15,
          left: 235,
          top: 65,
          angle: 90
        });
        const line = new fabric.Line([50, 100, 200, 100], { ...objOptions, left: 75, top: 70 });
        objType = new fabric.Group([line, triangle]);
        break;

      case 'Line':
        editor.isDrawingMode = false;
        objType = new fabric.Line([50, 10, 200, 150], { ...objOptions });
        break;

      case 'Sticky':
        objType = new fabric.Textbox('Your text here', {
          ...objOptions,
          backgroundColor: '#ffd54f',
          fill: '#000',
          width: 200,
          height: 150,
          padding: 20
        });
        break;
    }

    if (objType) {
      editor.add(objType);
      editor.centerObject(objType);
      editor.setActiveObject(objType);
    }

    editor.renderAll();
  };

  const onBottomMenu = (actionName: string) => {
    if (!editor) return;

    switch (actionName) {
      case 'Show Object Options':
        setShowObjOptions(!showObjOptions);
        break;

      case 'Export':
        const dataUrl = editor.toDataURL({ format: 'png' });
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = dataUrl;
        link.click();
        break;

      case 'Save':
        const canvasData = editor.toJSON();
        saveToFirebase(canvasData);
        break;

      case 'Erase':
        const activeObject = editor.getActiveObject();
        if (activeObject) editor.remove(activeObject);
        break;

      case 'Undo':
        (editor as any).undo();
        break;

      case 'Redo':
        (editor as any).redo();
        break;

      case 'Grid':
        setShowGrid(!showGrid);
        break;

      case 'Clear':
        if (confirm('Clear the entire whiteboard?')) {
          editor.clear();
          if (isTeacher) saveToFirebase({});
        }
        break;
    }
  };

  const onColorChange = (value: string) => {
    if (!editor) return;

    const activeObj = editor.getActiveObject();

    if (editor.isDrawingMode) {
      editor.freeDrawingBrush.color = value;
    } else if (activeObj) {
      activeObj.set(colorProp as any, value);
      editor.renderAll();
    }

    setObjOptions({ ...objOptions, [colorProp]: value });
  };

  const onOptionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return;

    const { name, value } = e.target;
    const numValue = parseFloat(value);
    const activeObj = editor.getActiveObject();

    if (editor.isDrawingMode && name === 'strokeWidth') {
      editor.freeDrawingBrush.width = numValue;
    }

    if (activeObj) {
      activeObj.set(name as any, numValue);
      editor.renderAll();
    }

    setObjOptions({ ...objOptions, [name]: numValue });
  };

  const backgroundImage = showGrid
    ? 'linear-gradient(to right, #dfdfdf 1px, transparent 1px), linear-gradient(to bottom, #dfdfdf 1px, transparent 1px)'
    : '';

  return (
    <div
      className={'w-100 h-100 whiteboard ' + className}
      style={{ backgroundImage, backgroundSize: '40px 40px' }}
      ref={parentRef}
    >
      {!isTeacher && (
        <div className="absolute top-4 left-4 bg-yellow-100 border border-yellow-400 px-3 py-2 rounded text-sm">
          👁️ View Only - Teacher is controlling the whiteboard
        </div>
      )}

      {showObjOptions && isTeacher && (
        <div className="left-menu">
          <div className="bg-white d-flex align-center justify-between shadow br-7">
            <label>Font size</label>
            <input
              type="number"
              min="1"
              name="fontSize"
              onChange={onOptionsChange}
              value={objOptions.fontSize}
            />
          </div>

          <div className="bg-white d-flex align-center justify-between shadow br-7">
            <label>Stroke</label>
            <input
              type="number"
              min="1"
              name="strokeWidth"
              onChange={onOptionsChange}
              value={objOptions.strokeWidth}
            />
          </div>

          <div className="bg-white d-flex flex-column shadow br-7">
            <div className="d-flex align-end mb-10">
              <input
                type="radio"
                name="color"
                value="stroke"
                checked={colorProp === 'stroke'}
                onChange={(e) => setColorProp(e.target.value)}
              />
              <label>Stroke</label>
            </div>
            <div className="d-flex align-end mb-10">
              <input
                type="radio"
                name="color"
                value="fill"
                checked={colorProp === 'fill'}
                onChange={(e) => setColorProp(e.target.value)}
              />
              <label>Fill</label>
            </div>
            <RgbaStringColorPicker color={objOptions[colorProp as keyof typeof objOptions] as string} onChange={onColorChange} />
          </div>
        </div>
      )}

      {isTeacher && (
        <div className="w-100 d-flex justify-center align-center" style={{ position: 'fixed', top: '10px', left: 0, zIndex: 9999 }}>
          <div className="bg-white d-flex justify-center align-center shadow br-7">
            {toolbar.map((item) => (
              <button key={item.title} onClick={() => onToolbar(item.title)} title={item.title}>
                {item.icon}
              </button>
            ))}
            <Dropdown title={<GeometryIcon />}>
              <button onClick={() => onToolbar('Circle')} title="Circle">
                <CircleIcon />
              </button>
              <button onClick={() => onToolbar('Rect')} title="Rectangle">
                <RectIcon />
              </button>
              <button onClick={() => onToolbar('Triangle')} title="Triangle">
                <TriangleIcon />
              </button>
            </Dropdown>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="canvas" />

      {isTeacher && (
        <div className="w-100 bottom-menu">
          <div className="d-flex align-center bg-white br-7 shadow">
            {bottomMenu.map((item) => (
              <button key={item.title} onClick={() => onBottomMenu(item.title)} title={item.title}>
                {item.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
          }
