import { useState, lazy, Suspense } from 'react'
import ErrorBoundary from './components/ErrorBoundary'

const FamilyTree = lazy(() => import('./components/FamilyTree'));
const RadialTree = lazy(() => import('./components/RadialTree'));

type ViewMode = 'tree' | 'radial';

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('tree');

  return (
    <div className="h-screen flex flex-col">
      <header className="shrink-0 flex items-baseline justify-between gap-6 px-6 py-4 border-b border-rule">
        <div className="flex items-baseline gap-4 min-w-0">
          <h1 className="text-2xl font-normal leading-none">Linux Ancestry</h1>
          <p className="hidden md:block text-[0.95rem] font-light text-muted truncate">
            A family tree of Linux distributions, 1991 to today.
          </p>
        </div>

        <nav aria-label="View" className="flex items-baseline gap-5 text-[0.95rem]">
          <button className="textbtn" aria-pressed={viewMode === 'tree'} onClick={() => setViewMode('tree')}>Timeline</button>
          <button className="textbtn" aria-pressed={viewMode === 'radial'} onClick={() => setViewMode('radial')}>Radial</button>
          <a href="https://github.com/ls0775/linuxancestry.ls0775.com" className="text-muted hover:text-text">Source</a>
        </nav>
      </header>

      <main className="flex-1 min-h-0">
        <ErrorBoundary>
          <Suspense fallback={<p className="p-6 text-muted font-light">Loading…</p>}>
            {viewMode === 'tree' && <FamilyTree />}
            {viewMode === 'radial' && <RadialTree />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default App
