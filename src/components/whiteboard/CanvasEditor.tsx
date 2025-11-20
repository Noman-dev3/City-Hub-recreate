// components/whiteboard/EnhancedCanvasEditor.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import { RgbaStringColorPicker } from "react-colorful";
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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

// Debounce utility
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

// Shape auto-correction helper
function recognizeShape(path: fabric.Path): fabric.Object | null {
  try {
    const pathData = path.path;
    if (!pathData || pathData.length < 10) return null;

    const bounds = path.getBoundingRect();
    const width = bounds.width;
    const height = bounds.height;
    
    if (width < 20 || height < 20) return null; // Too small
    
    const aspectRatio = width / height;

    // Circle detection
    if (aspectRatio > 0.75 && aspectRatio < 1.25 && width > 40) {
      const radius = Math.max(width, height) / 2;
      return new fabric.Circle({
        radius,
        left: bounds.left,
        top: bounds.top,
        stroke: path.stroke || '#000000',
        strokeWidth: path.strokeWidth || 2,
        fill: 'transparent',
        selectable: true
      });
    }

    // Rectangle detection
    if (width > 40 && height > 40) {
      return new fabric.Rect({
        width,
        height,
        left: bounds.left,
        top: bounds.top,
        stroke: path.stroke || '#000000',
        strokeWidth: path.strokeWidth || 2,
        fill: 'transparent',
        selectable: true
      });
    }

    return null;
  } catch (e) {
    console.error('Shape recognition error:', e);
    return null;
  }
}

export function EnhancedCanvasEditor({ className, options, classId, isTeacher, userId }: IProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firestore = useFirestore();
  const editorRef = useRef<fabric.Canvas | null>(null);

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
  const [currentTool, setCurrentTool] = useState<string>('Draw');
  
  const historyRef = useRef<{
    undo: string[];
    redo: string[];
    processing: boolean;
  }>({ undo: [], redo: [], processing: false });

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
        console.log('✅ Saved to Firebase');
      } catch (err) {
        console.error('❌ Failed to save whiteboard:', err);
      }
    }, 800),
    [firestore, classId, userId, isTeacher, isUpdating]
  );

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !parentRef.current || editorRef.current) return;

    console.log('🎨 Initializing canvas...');

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: true, // Start with drawing enabled
      selection: true,
      backgroundColor: '#ffffff',
      ...options
    });

    // Configure drawing brush
    canvas.freeDrawingBrush.width = 3;
    canvas.freeDrawingBrush.color = '#000000';

    // Set canvas dimensions
    const parent = parentRef.current;
    canvas.setHeight(parent.clientHeight);
    canvas.setWidth(parent.clientWidth);

    // Save history on changes
    const saveHistory = () => {
      if (historyRef.current.processing) return;
      const json = JSON.stringify(canvas.toJSON());
      historyRef.current.undo.push(json);
      if (historyRef.current.undo.length > 50) {
        historyRef.current.undo.shift();
      }
      historyRef.current.redo = []; // Clear redo on new action
    };

    canvas.on('object:added', saveHistory);
    canvas.on('object:modified', saveHistory);
    canvas.on('object:removed', saveHistory);

    // Shape auto-correction (only if enabled)
    canvas.on('path:created', (e: any) => {
      if (!e.path) return;
      
      const path = e.path as fabric.Path;
      const recognizedShape = recognizeShape(path);
      
      if (recognizedShape) {
        canvas.remove(path);
        canvas.add(recognizedShape);
        canvas.setActiveObject(recognizedShape);
        canvas.renderAll();
        console.log('✨ Shape auto-corrected!');
      }
    });

    // Undo function
    (canvas as any).undo = () => {
      const history = historyRef.current;
      if (history.undo.length === 0) return;
      
      history.processing = true;
      const current = JSON.stringify(canvas.toJSON());
      history.redo.push(current);
      const previous = history.undo.pop()!;
      
      canvas.loadFromJSON(previous, () => {
        canvas.renderAll();
        history.processing = false;
        console.log('⬅️ Undo');
      });
    };

    // Redo function
    (canvas as any).redo = () => {
      const history = historyRef.current;
      if (history.redo.length === 0) return;
      
      history.processing = true;
      const current = JSON.stringify(canvas.toJSON());
      history.undo.push(current);
      const next = history.redo.pop()!;
      
      canvas.loadFromJSON(next, () => {
        canvas.renderAll();
        history.processing = false;
        console.log('➡️ Redo');
      });
    };

    canvas.renderAll();
    editorRef.current = canvas;
    setEditor(canvas);
    setCurrentTool('Draw');

    console.log('✅ Canvas initialized! Drawing mode:', canvas.isDrawingMode);

    // Keyboard shortcuts
    const handleKeydown = (e: KeyboardEvent) => {
      if (!canvas) return;

      // Delete key
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeObject = canvas.getActiveObject();
        if (activeObject && !canvas.isDrawingMode) {
          canvas.remove(activeObject);
          e.preventDefault();
        }
      }

      // Ctrl/Cmd + Z (Undo)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        (canvas as any).undo();
      }

      // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z (Redo)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        (canvas as any).redo();
      }
    };

    document.addEventListener('keydown', handleKeydown);

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up canvas...');
      canvas.off('object:added', saveHistory);
      canvas.off('object:modified', saveHistory);
      canvas.off('object:removed', saveHistory);
      document.removeEventListener('keydown', handleKeydown);
      canvas.dispose();
      editorRef.current = null;
    };
  }, [options]);

  // Firebase real-time sync (for students)
  useEffect(() => {
    if (!firestore || !editor || !classId || isTeacher) return;

    console.log('👂 Student listening for whiteboard updates...');

    const unsubscribe = onSnapshot(
      doc(firestore, 'classes', classId, 'whiteboard', 'current'),
      (snapshot) => {
        if (!snapshot.exists()) return;
        
        const data = snapshot.data();
        if (data.updatedBy === userId) return; // Skip own updates

        console.log('📥 Received whiteboard update from teacher');
        setIsUpdating(true);
        
        editor.loadFromJSON(data.canvasData, () => {
          editor.renderAll();
          setIsUpdating(false);
        });
      },
      (error) => {
        console.error('❌ Firebase sync error:', error);
      }
    );

    return () => unsubscribe();
  }, [firestore, editor, classId, userId, isTeacher]);

  // Save to Firebase when teacher modifies (only for teacher)
  useEffect(() => {
    if (!editor || !isTeacher) return;

    console.log('💾 Teacher: Auto-save enabled');

    const handleChange = () => {
      if (historyRef.current.processing) return;
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

  // Handle window resize
  useEffect(() => {
    if (!editor || !parentRef.current) return;

    const handleResize = debounce(() => {
      const parent = parentRef.current;
      if (!parent) return;
      
      editor.setHeight(parent.clientHeight);
      editor.setWidth(parent.clientWidth);
      editor.renderAll();
    }, 250);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [editor]);

  const onToolbar = (objName: string) => {
    if (!editor) return;

    console.log('🔧 Tool selected:', objName);
    setCurrentTool(objName);
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
        console.log('✏️ Drawing mode ON');
        break;

      case 'Text':
        editor.isDrawingMode = false;
        objType = new fabric.Textbox('Type here...', { 
          fontSize: objOptions.fontSize,
          fill: '#000000',
          left: 100,
          top: 100
        });
        break;

      case 'Circle':
        editor.isDrawingMode = false;
        objType = new fabric.Circle({ 
          ...objOptions, 
          radius: 50,
          left: 100,
          top: 100
        });
        break;

      case 'Rect':
        editor.isDrawingMode = false;
        objType = new fabric.Rect({ 
          ...objOptions, 
          width: 100, 
          height: 100,
          left: 100,
          top: 100
        });
        break;

      case 'Triangle':
        editor.isDrawingMode = false;
        objType = new fabric.Triangle({ 
          ...objOptions, 
          width: 100, 
          height: 100,
          left: 100,
          top: 100
        });
        break;

      case 'Arrow':
        editor.isDrawingMode = false;
        const triangle = new fabric.Triangle({
          width: 15,
          height: 20,
          fill: objOptions.stroke,
          left: 185,
          top: 90,
          angle: 90
        });
        const line = new fabric.Line([50, 100, 180, 100], { 
          stroke: objOptions.stroke,
          strokeWidth: objOptions.strokeWidth
        });
        objType = new fabric.Group([line, triangle], {
          left: 100,
          top: 100
        });
        break;

      case 'Line':
        editor.isDrawingMode = false;
        objType = new fabric.Line([50, 50, 200, 200], { 
          ...objOptions,
          left: 100,
          top: 100
        });
        break;

      case 'Sticky':
        editor.isDrawingMode = false;
        objType = new fabric.Textbox('Sticky note...', {
          backgroundColor: '#fff740',
          fill: '#000',
          fontSize: 16,
          width: 200,
          height: 150,
          padding: 15,
          left: 100,
          top: 100,
          textAlign: 'left'
        });
        break;
    }

    if (objType) {
      editor.add(objType);
      editor.setActiveObject(objType);
      editor.renderAll();
    }
  };

  const onBottomMenu = (actionName: string) => {
    if (!editor) return;

    console.log('⚙️ Action:', actionName);

    switch (actionName) {
      case 'Show Object Options':
        setShowObjOptions(!showObjOptions);
        break;

      case 'Export':
        const dataUrl = editor.toDataURL({ format: 'png', quality: 1 });
        const link = document.createElement('a');
        link.download = `whiteboard-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
        console.log('📤 Exported as PNG');
        break;

      case 'Save':
        if (isTeacher) {
          const canvasData = editor.toJSON();
          saveToFirebase(canvasData);
          console.log('💾 Manual save triggered');
        }
        break;

      case 'Erase':
        const activeObject = editor.getActiveObject();
        if (activeObject) {
          editor.remove(activeObject);
          console.log('🗑️ Object deleted');
        }
        break;

      case 'Undo':
        (editor as any).undo();
        break;

      case 'Redo':
        (editor as any).redo();
        break;

      case 'Grid':
        setShowGrid(!showGrid);
        console.log('📐 Grid toggled');
        break;

      case 'Clear':
        if (confirm('⚠️ Clear the entire whiteboard? This cannot be undone!')) {
          editor.clear();
          editor.backgroundColor = '#ffffff';
          editor.renderAll();
          if (isTeacher) {
            saveToFirebase({ objects: [], background: '#ffffff' });
          }
          console.log('🧹 Canvas cleared');
        }
        break;
    }
  };

  const onColorChange = (value: string) => {
    if (!editor) return;

    const activeObj = editor.getActiveObject();

    if (editor.isDrawingMode) {
      editor.freeDrawingBrush.color = value;
      setObjOptions(prev => ({ ...prev, stroke: value }));
    } else if (activeObj) {
      activeObj.set(colorProp as any, value);
      editor.renderAll();
    }

    console.log(`🎨 Color changed: ${colorProp} = ${value}`);
  };

  const onOptionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editor) return;

    const { name, value } = e.target;
    const numValue = parseFloat(value);
    const activeObj = editor.getActiveObject();

    if (editor.isDrawingMode && name === 'strokeWidth') {
      editor.freeDrawingBrush.width = numValue;
      console.log(`✏️ Brush width: ${numValue}`);
    }

    if (activeObj) {
      activeObj.set(name as any, numValue);
      editor.renderAll();
    }

    setObjOptions(prev => ({ ...prev, [name]: numValue }));
  };

  const backgroundImage = showGrid
    ? 'linear-gradient(to right, #e0e0e0 1px, transparent 1px), linear-gradient(to bottom, #e0e0e0 1px, transparent 1px)'
    : '';

  return (
    <div
      className={'w-100 h-100 whiteboard ' + (className || '')}
      style={{ 
        backgroundImage, 
        backgroundSize: '40px 40px',
        position: 'relative'
      }}
      ref={parentRef}
    >
      {/* Student View-Only Badge */}
      {!isTeacher && (
        <div 
          className="absolute top-4 left-4 bg-blue-100 border-2 border-blue-500 px-4 py-2 rounded-lg shadow-lg z-50"
          style={{ pointerEvents: 'none' }}
        >
          <span className="text-blue-800 font-semibold text-sm">👁️ View Only Mode</span>
        </div>
      )}

      {/* Teacher Controls */}
      {isTeacher && (
        <>
          {/* Options Panel */}
          {showObjOptions && (
            <div className="left-menu">
              <div className="bg-white d-flex align-center justify-between shadow br-7">
                <label>Font Size</label>
                <input
                  type="number"
                  min="8"
                  max="72"
                  name="fontSize"
                  onChange={onOptionsChange}
                  value={objOptions.fontSize}
                />
              </div>

              <div className="bg-white d-flex align-center justify-between shadow br-7">
                <label>Stroke Width</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  name="strokeWidth"
                  onChange={onOptionsChange}
                  value={objOptions.strokeWidth}
                />
              </div>

              <div className="bg-white d-flex flex-column shadow br-7">
                <div className="d-flex align-end mb-10">
                  <input
                    className="mr-10"
                    type="radio"
                    name="color"
                    value="stroke"
                    checked={colorProp === 'stroke'}
                    onChange={(e) => setColorProp(e.target.value)}
                  />
                  <label>Stroke Color</label>
                </div>
                <div className="d-flex align-end mb-10">
                  <input
                    className="mr-10"
                    type="radio"
                    name="color"
                    value="fill"
                    checked={colorProp === 'fill'}
                    onChange={(e) => setColorProp(e.target.value)}
                  />
                  <label>Fill Color</label>
                </div>
                <RgbaStringColorPicker 
                  color={objOptions[colorProp as keyof typeof objOptions] as string} 
                  onChange={onColorChange} 
                />
              </div>
            </div>
          )}

          {/* Top Toolbar */}
          <div className="w-100 d-flex justify-center align-center" style={{ position: 'fixed', top: '10px', left: 0, zIndex: 9999 }}>
            <div className="bg-white d-flex justify-center align-center shadow br-7">
              {toolbar.map((item) => (
                <button 
                  key={item.title} 
                  onClick={() => onToolbar(item.title)} 
                  title={item.title}
                  style={{ 
                    backgroundColor: currentTool === item.title ? '#000' : 'transparent',
                    color: currentTool === item.title ? '#fff' : '#000'
                  }}
                >
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

          {/* Bottom Menu */}
          <div className="w-100 bottom-menu">
            <div className="d-flex align-center bg-white br-7 shadow">
              {bottomMenu.map((item) => (
                <button 
                  key={item.title} 
                  onClick={() => onBottomMenu(item.title)} 
                  title={item.title}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} />

      {/* Loading Indicator */}
      {isUpdating && (
        <div className="absolute top-4 right-4 bg-green-100 border border-green-400 px-3 py-2 rounded shadow-lg">
          <span className="text-green-800 text-sm">🔄 Syncing...</span>
        </div>
      )}
    </div>
  );
}
