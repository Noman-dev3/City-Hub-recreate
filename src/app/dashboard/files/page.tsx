'use client';
import { useState, useRef } from 'react';
import {
  Upload, File, FileText, Image as ImageIcon, Video, Music, Archive,
  X, Download, Eye, Trash2, Search, Grid, List, HardDrive, Clock
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'; // shadcn/ui or similar

export default function ModernFilesPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [previewFile, setPreviewFile] = useState(null); // For modal
  const fileInputRef = useRef(null);

  const classes = [
    { id: 'all', name: 'All Files' },
    { id: 'class1', name: 'Mathematics 101' },
    { id: 'class2', name: 'Physics Advanced' },
    { id: 'class3', name: 'Chemistry Basics' }
  ];

  // Helper: Detect file type
  const isImage = (type) => type.startsWith('image/');
  const isPdf = (type) => type === 'application/pdf' || type.includes('pdf');
  const isVideo = (type) => type.startsWith('video/');
  const isAudio = (type) => type.startsWith('audio/');

  const getFileIcon = (type, size = "w-6 h-6") => {
    if (isImage(type)) return <ImageIcon className={size} />;
    if (isVideo(type)) return <Video className={size} />;
    if (isAudio(type)) return <Music className={size} />;
    if (isPdf(type)) return <FileText className={`${size} text-red-600`} />;
    if (type.includes('zip') || type.includes('rar')) return <Archive className={size} />;
    return <File className={size} />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Drag & Drop Handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFiles(e.dataTransfer.files);
  };

  const handleFileInput = (e) => {
    if (e.target.files?.[0]) handleFiles(e.target.files);
  };

  const handleFiles = async (fileList) => {
    setUploading(true);
    await new Promise(resolve => setTimeout(resolve, 1200));

    const newFiles = Array.from(fileList).map(file => ({
      id: Date.now() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type || file.name.split('.').pop(),
      uploadDate: new Date().toISOString(),
      classId: selectedClass === 'all' ? 'class1' : selectedClass,
      url: URL.createObjectURL(file),
      rawFile: file
    }));

    setFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
  };

  const deleteFile = (id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const downloadFile = (file) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    a.click();
  };

  const openPreview = (file) => setPreviewFile(file);

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'all' || file.classId === selectedClass;
    return matchesSearch && matchesClass;
  });

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  // Reusable Preview Component (for both grid & list)
  const FilePreview = ({ file, size = "large" }) => {
    const small = size === "small";

    if (isImage(file.type)) {
      return (
        <img
          src={file.url}
          alt={file.name}
          className={`${small ? 'w-10 h-10' : 'w-full h-40'} object-cover rounded-lg cursor-pointer hover:opacity-90 transition`}
          onClick={() => openPreview(file)}
        />
      );
    }

    if (isPdf(file.type)) {
      return (
        <div
          className={`${small ? 'w-10 h-10' : 'w-full h-40'} bg-red-50 border-2 border-dashed border-red-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-red-500 transition`}
          onClick={() => openPreview(file)}
        >
          <FileText className={`${small ? 'w-6 h-6' : 'w-16 h-16'} text-red-600`} />
        </div>
      );
    }

    if (isVideo(file.type)) {
      return (
        <div className="relative group cursor-pointer" onClick={() => openPreview(file)}>
          <video src={file.url} className={`${small ? 'w-10 h-10' : 'w-full h-40'} object-cover rounded-lg`} />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
            <Video className="w-10 h-10 text-white opacity-80" />
          </div>
        </div>
      );
    }

    return (
      <div className={`${small ? 'w-10 h-10' : 'w-full h-40'} bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center`}>
        {getFileIcon(file.type, small ? "w-6 h-6" : "w-16 h-16")}
      </div>
    );
  };

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 p-8">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
                  Class Files
                </h1>
                <p className="text-gray-600">Manage and organize your class materials</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5"
              >
                <Upload className="w-5 h-5" />
                Upload Files
              </button>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileInput} className="hidden" />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg"><File className="w-6 h-6 text-blue-600" /></div>
                  <div><p className="text-sm text-gray-600">Total Files</p><p className="text-2xl font-bold">{files.length}</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg"><HardDrive className="w-6 h-6 text-purple-600" /></div>
                  <div><p className="text-sm text-gray-600">Storage Used</p><p className="text-2xl font-bold">{formatFileSize(totalSize)}</p></div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg"><Clock className="w-6 h-6 text-green-600" /></div>
                  <div><p className="text-sm text-gray-600">Recent Upload</p><p className="text-2xl font-bold">{files.length > 0 ? 'Today' : 'None'}</p></div>
                </div>
              </div>
            </div>

            {/* Search + Filters + View Toggle */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search files..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <Grid className="w-5 h-5" />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Empty State / Drag Zone */}
          {files.length === 0 && (
            <div onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
              className={`mb-8 border-2 border-dashed rounded-2xl p-16 text-center transition-all ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'}`}>
              <div className="p-4 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full inline-block mb-4">
                <Upload className="w-12 h-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{dragActive ? 'Drop files here' : 'Upload your files'}</h3>
              <p className="text-gray-600 mb-4">Drag and drop or click to browse</p>
              <button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Choose Files
              </button>
            </div>
          )}

          {/* Uploading Indicator */}
          {uploading && (
            <div className="mb-6 bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span>Uploading files...</span>
            </div>
          )}

          {/* === GRID VIEW === */}
          {viewMode === 'grid' && filteredFiles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredFiles.map(file => (
                <div key={file.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-xl transition-all duration-300 group overflow-hidden">
                  <div className="relative">
                    <FilePreview file={file} size="large" />
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-2">
                      <button onClick={() => openPreview(file)} className="p-2 bg-white/90 backdrop-blur rounded-lg shadow hover:bg-white">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-gray-900 truncate flex-1 pr-3" title={file.name}>{file.name}</h3>
                      <div className="flex gap-1">
                        <button onClick={() => downloadFile(file)} className="p-1.5 hover:bg-gray-100 rounded"><Download className="w-4 h-4 text-gray-600" /></button>
                        <button onClick={() => deleteFile(file.id)} className="p-1.5 hover:bg-red-100 rounded"><Trash2 className="w-4 h-4 text-red-600" /></button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{new Date(file.uploadDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* === LIST VIEW WITH PREVIEWS === */}
          {viewMode === 'list' && filteredFiles.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preview</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Uploaded</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFiles.map(file => (
                    <tr key={file.id} className="hover:bg-gray-50 transition">
                      
                        <td className="px-6 py-4">
                          <div className="w-12 h-12">
                          <FilePreview file={file} size="small" />
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:block">{getFileIcon(file.type, "w-5 h-5 text-gray-500")}</div>
                          <span className="font-medium text-gray-900 truncate max-w-xs" title={file.name}>
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatFileSize(file.size)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{new Date(file.uploadDate).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openPreview(file)} className="p-2 hover:bg-blue-100 rounded-lg transition" title="Preview">
                            <Eye className="w-4 h-4 text-blue-600" />
                          </button>
                          <button onClick={() => downloadFile(file)} className="p-2 hover:bg-gray-100 rounded-lg transition" title="Download">
                            <Download className="w-4 h-4 text-gray-600" />
                          </button>
                          <button onClick={() => deleteFile(file.id)} className="p-2 hover:bg-red-100 rounded-lg transition" title="Delete">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* No Results */}
          {filteredFiles.length === 0 && (searchQuery || selectedClass !== 'all') && (
            <div className="text-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No files found</h3>
              <p className="text-gray-600">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>

      {/* Full-Screen Preview Modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-6xl w-full h-screen max-h-screen p-0 bg-black/95 border-none">
          <DialogHeader className="absolute top-4 left-4 right-4 z-50 flex justify-between items-start text-white">
            <div>
              <DialogTitle className="text-xl truncate max-w-2xl">{previewFile?.name}</DialogTitle>
              <p className="text-sm opacity-80">{previewFile && formatFileSize(previewFile.size)}</p>
            </div>
            <button onClick={() => setPreviewFile(null)} className="p-2 bg-white/20 hover:bg-white/40 rounded-full backdrop-blur transition">
              <X className="w-6 h-6" />
            </button>
          </DialogHeader>

          <div className="flex items-center justify-center h-full p-8">
            {previewFile && (
              <>
                {isImage(previewFile.type) && (
                  <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain rounded-lg" />
                )}
                {isPdf(previewFile.type) && (
                  <iframe src={previewFile.url} className="w-full h-full rounded-lg" title={previewFile.name} />
                )}
                {isVideo(previewFile.type) && (
                  <video src={previewFile.url} controls autoPlay className="max-w-full max-h-full rounded-lg">
                    Your browser does not support video.
                  </video>
                )}
                {isAudio(previewFile.type) && (
                  <div className="text-center">
                    <Music className="w-24 h-24 text-white mb-8 opacity-50" />
                    <audio src={previewFile.url} controls autoPlay className="w-96 max-w-full" />
                  </div>
                )}
                {!isImage(previewFile.type) && !isPdf(previewFile.type) && !isVideo(previewFile.type) && !isAudio(previewFile.type) && (
                  <div className="text-center text-white">
                    <FileText className="w-24 h-24 mx-auto mb-4 opacity-50" />
                    <p className="text-xl">Preview not available</p>
                    <button onClick={() => downloadFile(previewFile)} className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition">
                      Download File
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
