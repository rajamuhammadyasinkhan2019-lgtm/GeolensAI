import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileImage, 
  Layers, 
  PieChart as PieChartIcon, 
  Info, 
  Loader2, 
  ChevronRight, 
  Microscope,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Maximize2,
  LogIn,
  LogOut,
  History,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { analyzePhotomicrograph, type AnalysisResult, type GeologyComponent } from './services/geminiService';
import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  Timestamp
} from 'firebase/firestore';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnalyzedImage {
  id: string;
  file: File;
  preview: string;
  status: 'idle' | 'analyzing' | 'completed' | 'error';
  result?: AnalysisResult;
  error?: string;
}

interface SavedAnalysis extends AnalysisResult {
  id: string;
  userId: string;
  fileName: string;
  timestamp: string;
}

const COLORS = ['#4D7C0F', '#15803D', '#166534', '#065F46', '#064E3B', '#365314', '#14532D'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [images, setImages] = useState<AnalyzedImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      
      if (currentUser) {
        // Sync user profile
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              role: 'user'
            });
          }
        } catch (error) {
          console.error("Error syncing user profile:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!user || !isAuthReady) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'analyses'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedAnalysis[];
      setHistory(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const login = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setImages([]);
      setSelectedImageId(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = (files: File[]) => {
    const newImages: AnalyzedImage[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: 'idle'
    }));
    setImages(prev => [...prev, ...newImages]);
    if (!selectedImageId && newImages.length > 0) {
      setSelectedImageId(newImages[0].id);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const analyzeImage = async (id: string) => {
    const img = images.find(i => i.id === id);
    if (!img || img.status === 'analyzing') return;

    setImages(prev => prev.map(i => i.id === id ? { ...i, status: 'analyzing', error: undefined } : i));

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(img.file);
      });
      const base64 = await base64Promise;
      
      const result = await analyzePhotomicrograph(base64, img.file.type);
      
      // Save to Firestore if logged in
      if (user) {
        const analysisData = {
          userId: user.uid,
          fileName: img.file.name,
          timestamp: new Date().toISOString(),
          ...result
        };
        await addDoc(collection(db, 'analyses'), analysisData);
      }
      
      setImages(prev => prev.map(i => i.id === id ? { 
        ...i, 
        status: 'completed', 
        result 
      } : i));
    } catch (err) {
      setImages(prev => prev.map(i => i.id === id ? { 
        ...i, 
        status: 'error', 
        error: err instanceof Error ? err.message : 'Unknown error' 
      } : i));
    }
  };

  const analyzeAll = () => {
    images.forEach(img => {
      if (img.status === 'idle' || img.status === 'error') {
        analyzeImage(img.id);
      }
    });
  };

  const selectedImage = images.find(img => img.id === selectedImageId);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#1A1C1E] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-lime-500 animate-spin" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[#1A1C1E] text-stone-200 font-sans selection:bg-lime-900 selection:text-lime-100">
      {/* Header */}
      <header className="border-b border-stone-800 bg-[#1A1C1E]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-lime-700 rounded-lg flex items-center justify-center shadow-lg shadow-lime-900/20">
              <Microscope className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">GeoLens AI</h1>
              <p className="text-[10px] uppercase tracking-widest text-stone-500 font-semibold">Scientific Analysis Suite</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    showHistory ? "bg-lime-900/30 text-lime-500" : "hover:bg-stone-800 text-stone-400"
                  )}
                  title="Analysis History"
                >
                  <History size={20} />
                </button>
                <div className="flex items-center gap-2 bg-stone-800 px-3 py-1.5 rounded-full border border-stone-700">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
                  ) : (
                    <UserIcon size={14} className="text-stone-400" />
                  )}
                  <span className="text-xs font-medium text-stone-300 max-w-[100px] truncate">{user.displayName || user.email}</span>
                  <button onClick={logout} className="ml-2 p-1 hover:text-red-500 transition-colors">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={login}
                className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-full text-sm font-medium transition-colors border border-stone-700"
              >
                <LogIn size={16} />
                <span>Sign In</span>
              </button>
            )}
            <div className="w-px h-6 bg-stone-800 mx-1" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-full text-sm font-medium transition-colors border border-stone-700"
            >
              <Upload size={16} />
              <span>Upload</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={onFileChange} 
              multiple 
              accept="image/*" 
              className="hidden" 
            />
            {images.length > 0 && (
              <button 
                onClick={analyzeAll}
                className="flex items-center gap-2 px-6 py-2 bg-lime-700 hover:bg-lime-600 rounded-full text-sm font-bold text-white transition-all shadow-lg shadow-lime-900/20 active:scale-95"
              >
                <Layers size={16} />
                <span>Analyze All</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar: Batch List or History */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-stone-500">
              {showHistory ? 'Analysis History' : 'Batch Queue'}
            </h2>
            <span className="text-xs bg-stone-800 px-2 py-0.5 rounded-full text-stone-400">
              {showHistory ? history.length : images.length}
            </span>
          </div>
          
          <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 custom-scrollbar">
            {showHistory ? (
              history.length === 0 ? (
                <div className="text-center py-12 text-stone-600">
                  <History size={32} className="mx-auto mb-4 opacity-20" />
                  <p className="text-xs uppercase tracking-widest font-bold">No history found</p>
                </div>
              ) : (
                history.map(item => (
                  <div 
                    key={item.id}
                    onClick={() => {
                      // Create a mock image object to show history details
                      const mockImg: AnalyzedImage = {
                        id: item.id,
                        file: new File([], item.fileName),
                        preview: 'https://picsum.photos/seed/geology/800/800', // Placeholder for history
                        status: 'completed',
                        result: item
                      };
                      // This is a simplification; in a real app we'd load the image from storage
                      // For now, we'll just show the data
                      setImages(prev => {
                        if (prev.find(i => i.id === item.id)) return prev;
                        return [...prev, mockImg];
                      });
                      setSelectedImageId(item.id);
                      setShowHistory(false);
                    }}
                    className="group p-3 rounded-xl border border-stone-800 bg-stone-900/50 hover:border-lime-700/50 cursor-pointer transition-all"
                  >
                    <p className="text-xs font-bold text-stone-300 truncate">{item.fileName}</p>
                    <p className="text-[10px] text-stone-500 mt-1">{new Date(item.timestamp).toLocaleDateString()}</p>
                    <div className="flex gap-1 mt-2">
                      {item.components.slice(0, 3).map((c, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      ))}
                    </div>
                  </div>
                ))
              )
            ) : (
              images.length === 0 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-stone-700 hover:bg-stone-800/30 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-stone-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="text-stone-500" />
                  </div>
                  <p className="text-sm text-stone-400 font-medium">Drop photomicrographs here</p>
                  <p className="text-[10px] text-stone-600 mt-1 uppercase tracking-tighter">Supports JPG, PNG, TIFF</p>
                </div>
              ) : (
                images.map(img => (
                  <motion.div 
                    layout
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className={cn(
                      "group relative p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-3",
                      selectedImageId === img.id 
                        ? "bg-stone-800 border-lime-700/50 shadow-lg" 
                        : "bg-[#1A1C1E] border-stone-800 hover:border-stone-700"
                    )}
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-stone-900">
                      {img.preview.startsWith('http') ? (
                        <div className="w-full h-full flex items-center justify-center bg-stone-800">
                          <FileImage size={20} className="text-stone-600" />
                        </div>
                      ) : (
                        <img src={img.preview} alt="" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      )}
                      {img.status === 'analyzing' && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-lime-500 animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-stone-300">{img.file.name}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {img.status === 'completed' && <CheckCircle2 size={10} className="text-lime-500" />}
                        {img.status === 'error' && <AlertCircle size={10} className="text-red-500" />}
                        <span className={cn(
                          "text-[10px] uppercase font-bold tracking-tighter",
                          img.status === 'completed' ? "text-lime-500" : 
                          img.status === 'error' ? "text-red-500" : 
                          img.status === 'analyzing' ? "text-lime-400" : "text-stone-600"
                        )}>
                          {img.status}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/20 hover:text-red-500 rounded-md transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))
              )
            )}
          </div>
        </div>

        {/* Main Content: Viewer & Results */}
        <div className="lg:col-span-9 space-y-6">
          {selectedImage ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* Image Viewer */}
              <div className="space-y-4">
                <div className="relative aspect-square rounded-3xl overflow-hidden bg-stone-900 border border-stone-800 shadow-2xl group">
                  <img 
                    src={selectedImage.preview} 
                    alt="Photomicrograph" 
                    className="w-full h-full object-contain"
                  />
                  
                  {/* Labels Overlay */}
                  {selectedImage.status === 'completed' && selectedImage.result?.components.map((comp, idx) => (
                    comp.labelPosition && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5 + idx * 0.1 }}
                        key={idx}
                        style={{ 
                          left: `${comp.labelPosition.x}%`, 
                          top: `${comp.labelPosition.y}%` 
                        }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 group/label z-10"
                      >
                        <div className="w-4 h-4 rounded-full bg-lime-500 border-2 border-white shadow-lg cursor-help animate-pulse" />
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover/label:opacity-100 transition-opacity pointer-events-none">
                          <div className="bg-stone-900/90 backdrop-blur-md border border-stone-700 px-3 py-1.5 rounded-lg shadow-xl whitespace-nowrap">
                            <p className="text-xs font-bold text-white">{comp.name}</p>
                            <p className="text-[10px] text-lime-500 font-bold uppercase">{comp.type}</p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  ))}

                  {selectedImage.status === 'analyzing' && (
                    <div className="absolute inset-0 bg-stone-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-center p-8">
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-lime-900/30 border-t-lime-500 rounded-full animate-spin" />
                        <Microscope className="absolute inset-0 m-auto text-lime-500 w-8 h-8" />
                      </div>
                      <h3 className="mt-6 text-lg font-bold text-white">Analyzing Microstructure</h3>
                      <p className="mt-2 text-sm text-stone-400 max-w-xs">Our AI is identifying minerals, calculating volumetric percentages, and mapping textures...</p>
                    </div>
                  )}

                  {selectedImage.status === 'idle' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button 
                        onClick={() => analyzeImage(selectedImage.id)}
                        className="px-8 py-3 bg-lime-700 hover:bg-lime-600 text-white rounded-full font-bold shadow-xl shadow-lime-900/40 transition-all active:scale-95 flex items-center gap-2"
                      >
                        <Layers size={20} />
                        Start Analysis
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Filename</span>
                      <span className="text-sm font-medium text-stone-300">{selectedImage.file.name}</span>
                    </div>
                    <div className="w-px h-8 bg-stone-800" />
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Size</span>
                      <span className="text-sm font-medium text-stone-300">{(selectedImage.file.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  </div>
                  <button className="p-2 hover:bg-stone-800 rounded-full transition-colors text-stone-500">
                    <Maximize2 size={18} />
                  </button>
                </div>
              </div>

              {/* Results Panel */}
              <div className="space-y-6">
                <AnimatePresence mode="wait">
                  {selectedImage.status === 'completed' && selectedImage.result ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-6"
                    >
                      {/* Summary Card */}
                      <section className="bg-stone-800/50 border border-stone-700 rounded-3xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Info className="text-lime-500" size={18} />
                          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Analysis Summary</h3>
                        </div>
                        <p className="text-sm leading-relaxed text-stone-300">
                          {selectedImage.result.summary}
                        </p>
                        <div className="mt-4 pt-4 border-t border-stone-700/50">
                          <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1">Geological Context</p>
                          <p className="text-xs italic text-stone-400">{selectedImage.result.geologicalContext}</p>
                        </div>
                      </section>

                      {/* Volumetric Breakdown */}
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-stone-800/50 border border-stone-700 rounded-3xl p-6 flex flex-col items-center">
                          <div className="w-full flex items-center gap-2 mb-4">
                            <PieChartIcon className="text-lime-500" size={18} />
                            <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Volumetric %</h3>
                          </div>
                          <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={selectedImage.result.components}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={40}
                                  outerRadius={70}
                                  paddingAngle={5}
                                  dataKey="percentage"
                                  nameKey="name"
                                >
                                  {selectedImage.result.components.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  contentStyle={{ backgroundColor: '#1C1917', border: '1px solid #44403C', borderRadius: '8px', fontSize: '12px' }}
                                  itemStyle={{ color: '#D6D3D1' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="bg-stone-800/50 border border-stone-700 rounded-3xl p-6">
                          <div className="flex items-center gap-2 mb-4">
                            <Layers className="text-lime-500" size={18} />
                            <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Component List</h3>
                          </div>
                          <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                            {selectedImage.result.components.map((comp, idx) => (
                              <div key={idx} className="flex items-center justify-between group">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                  <span className="text-xs font-medium text-stone-300">{comp.name}</span>
                                </div>
                                <span className="text-xs font-bold text-lime-500">{comp.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </section>

                      {/* Detailed Components */}
                      <section className="space-y-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 px-2">Detailed Identification</h3>
                        {selectedImage.result.components.map((comp, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            key={idx} 
                            className="bg-stone-800/30 border border-stone-800 hover:border-stone-700 rounded-2xl p-4 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <h4 className="text-sm font-bold text-white">{comp.name}</h4>
                                <span className="text-[10px] px-2 py-0.5 bg-stone-700 text-stone-300 rounded-full font-bold uppercase tracking-tighter">
                                  {comp.type}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-lg font-black text-lime-600/50">{comp.percentage}%</span>
                              </div>
                            </div>
                            <p className="text-xs text-stone-400 leading-relaxed italic">
                              {comp.description}
                            </p>
                          </motion.div>
                        ))}
                      </section>
                    </motion.div>
                  ) : selectedImage.status === 'error' ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center text-center p-12 bg-red-900/10 border border-red-900/20 rounded-3xl"
                    >
                      <AlertCircle className="text-red-500 w-12 h-12 mb-4" />
                      <h3 className="text-lg font-bold text-white">Analysis Failed</h3>
                      <p className="text-sm text-stone-400 mt-2 max-w-xs">{selectedImage.error}</p>
                      <button 
                        onClick={() => analyzeImage(selectedImage.id)}
                        className="mt-6 px-6 py-2 bg-stone-800 hover:bg-stone-700 rounded-full text-sm font-bold transition-colors"
                      >
                        Retry Analysis
                      </button>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-stone-800 rounded-3xl h-full min-h-[400px]">
                      <div className="w-16 h-16 rounded-full bg-stone-800 flex items-center justify-center mb-6">
                        <Microscope className="text-stone-600 w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-bold text-stone-400">Ready for Analysis</h3>
                      <p className="text-sm text-stone-600 mt-2 max-w-xs">Select an image from the batch and click "Start Analysis" to begin scientific identification.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-24 px-8 border-2 border-dashed border-stone-800 rounded-[40px] bg-stone-900/20">
              <div className="w-24 h-24 rounded-full bg-stone-800 flex items-center justify-center mb-8">
                <FileImage className="text-stone-600 w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-stone-300">No Samples Loaded</h2>
              <p className="text-stone-500 mt-4 max-w-md text-lg">
                Upload single or batch photomicrographs to begin automated scientific identification and volumetric analysis.
              </p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="mt-10 px-10 py-4 bg-lime-700 hover:bg-lime-600 text-white rounded-full font-bold text-lg shadow-2xl shadow-lime-900/40 transition-all active:scale-95 flex items-center gap-3"
              >
                <Upload size={24} />
                Select Photomicrographs
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-stone-800 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <Microscope size={20} />
            <span className="text-sm font-bold tracking-widest uppercase">GeoLens AI v1.0</span>
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-xs text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest font-bold">Documentation</a>
            <a href="#" className="text-xs text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest font-bold">Scientific Methodology</a>
            <a href="#" className="text-xs text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest font-bold">Privacy Policy</a>
          </div>
          <p className="text-xs text-stone-600 font-medium">© 2026 Geological Analysis Systems. All rights reserved.</p>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #292524;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #44403C;
        }
      `}} />
    </div>
  );
}
