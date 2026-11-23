import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from '../components/layout/AppShell'
import RequireAuth from './RequireAuth'
import DashboardPage from '../pages/DashboardPage'
import AuthPage from '../pages/AuthPage'
import LandingPage from '../pages/LandingPage'
import WorkspacePage from '../pages/WorkspacePage'
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const LandingPage = lazy(() => import('../pages/LandingPage'))
const WorkspacePage = lazy(() => import('../pages/WorkspacePage'))

export default function App() {
  return (
    <Suspense fallback={<div className="app-loading" role="status">Opening Overseer…</div>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
      <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/schedule" element={<WorkspacePage page="schedule" />} />
            <Route path="/day-planner" element={<WorkspacePage page="dayPlanner" />} />
            <Route path="/tasks" element={<WorkspacePage page="tasks" />} />
            <Route path="/library" element={<WorkspacePage page="library" />} />
            <Route path="/library/import" element={<WorkspacePage page="import" />} />
            <Route path="/courses/:courseId" element={<WorkspacePage page="course" />} />
            <Route path="/lessons/:lessonId" element={<WorkspacePage page="lesson" />} />
            <Route path="/assistant" element={<WorkspacePage page="assistant" />} />
            <Route path="/focus" element={<WorkspacePage page="focus" />} />
            <Route path="/progress" element={<WorkspacePage page="progress" />} />
            <Route path="/settings" element={<WorkspacePage page="settings" />} />
            <Route path="*" element={<WorkspacePage page="notFound" />} />
        </Route>
        </Route>
        <Route path="/welcome" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
