import { useState, lazy, Suspense } from 'react'
import './App.css'

const FamilyTree = lazy(() => import('./components/FamilyTree'));
const RadialTree = lazy(() => import('./components/RadialTree'));
const SunburstView = lazy(() => import('./components/SunburstView'));
const IcicleView = lazy(() => import('./components/IcicleView'));

function App() {
  const [viewMode, setViewMode] = useState<'tree' | 'radial' | 'sunburst' | 'icicle'>('radial');

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 selection:bg-cyan-500/30">
      <header className="fixed top-0 left-0 right-0 z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current">
              <path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent italic">
            DistroWatch Family Tree
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 gap-1">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'tree' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              TIMELINE
            </button>
            <button
              onClick={() => setViewMode('radial')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'radial' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              RADIAL
            </button>
            <button
              onClick={() => setViewMode('sunburst')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'sunburst' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              SUNBURST
            </button>
            <button
              onClick={() => setViewMode('icicle')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${viewMode === 'icicle' ? 'bg-cyan-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              DENSITY
            </button>
          </div>
          <div className="text-sm font-medium text-slate-400 hidden lg:block">
            Interactive Exploration Layer
          </div>
        </div>
      </header>

      <main className="pt-20 h-screen w-full">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }>
          {viewMode === 'tree' && <FamilyTree />}
          {viewMode === 'radial' && <RadialTree />}
          {viewMode === 'sunburst' && <SunburstView />}
          {viewMode === 'icicle' && <IcicleView />}
        </Suspense>
      </main>

      <footer className="fixed bottom-4 left-6 z-10 hidden md:block">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-full px-4 py-2 text-xs text-slate-400 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            </div>
            Active (by Family)
          </div>
          <div className="w-px h-3 bg-slate-700/50"></div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            Discontinued
          </div>
        </div>
      </footer>

    </div>
  )
}

export default App
