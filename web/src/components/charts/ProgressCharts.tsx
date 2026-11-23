import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useReducedMotion } from 'motion/react'
import { useAppData } from '../../app/AppDataContext'
import Card from '../ui/Card'
import { durationLabel } from '../../data/dates'

export type FocusChartPoint = { day: string; label: string; minutes: number }
export type CourseChartPoint = { name: string; completed: number; total: number; percentage: number }
export type StudyActivityPoint = { day: string; label: string; lessons: number; tasks: number; focusSessions: number }

const tooltipStyle = {
  backgroundColor: 'var(--surface-raised)',
  borderColor: 'var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
  boxShadow: 'var(--shadow-card)',
}

function useChartAnimation() {
  const { data } = useAppData()
  const systemReducedMotion = useReducedMotion()
  return !data.preferences.reducedMotion && !systemReducedMotion
}

function ChartEmpty({ children }: { children: string }) {
  return <div className="chart-empty" role="status">{children}</div>
}

export function WeeklyFocusTimeChart({ data }: { data: FocusChartPoint[] }) {
  const animate = useChartAnimation()
  const hasFocus = data.some((point) => point.minutes > 0)
  return <Card className="progress-chart-card" padding="medium">
    <div className="progress-chart-heading"><div><h3>Weekly focus time</h3><p>Completed focus sessions this week</p></div><span>{durationLabel(data.reduce((sum, point) => sum + point.minutes * 60, 0))}</span></div>
    {hasFocus ? <div className="progress-chart"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(value: number) => `${value}m`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [durationLabel(Number(value) * 60), 'Focus time']} />
        <Bar dataKey="minutes" name="Focus time" fill="var(--chart-primary)" radius={[5, 5, 0, 0]} maxBarSize={36} isAnimationActive={animate} animationDuration={620} />
      </BarChart>
    </ResponsiveContainer></div> : <ChartEmpty>No completed focus sessions this week yet.</ChartEmpty>}
  </Card>
}

export function FocusActivityTrendChart({ data }: { data: FocusChartPoint[] }) {
  const animate = useChartAnimation()
  const hasFocus = data.some((point) => point.minutes > 0)
  return <Card className="progress-chart-card" padding="medium">
    <div className="progress-chart-heading"><div><h3>Focus activity</h3><p>Daily focus time over the last two weeks</p></div></div>
    {hasFocus ? <div className="progress-chart"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={1} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(value: number) => `${value}m`} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value) => [durationLabel(Number(value) * 60), 'Focus time']} />
        <Line type="monotone" dataKey="minutes" name="Focus time" stroke="var(--chart-primary)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-primary)' }} activeDot={{ r: 5 }} isAnimationActive={animate} animationDuration={620} />
      </LineChart>
    </ResponsiveContainer></div> : <ChartEmpty>No focus activity recorded in the last two weeks.</ChartEmpty>}
  </Card>
}

export function CourseProgressChart({ data }: { data: CourseChartPoint[] }) {
  const animate = useChartAnimation()
  return <Card className="progress-chart-card" padding="medium">
    <div className="progress-chart-heading"><div><h3>Course progress</h3><p>Completed lessons in each course</p></div></div>
    {data.length ? <div className="progress-chart"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(value: number) => `${value}%`} />
        <YAxis type="category" dataKey="name" width={106} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} formatter={(value, _name, item) => [`${value}% (${item.payload.completed}/${item.payload.total} lessons)`, 'Progress']} />
        <Bar dataKey="percentage" name="Progress" fill="var(--chart-primary)" radius={[0, 5, 5, 0]} maxBarSize={26} isAnimationActive={animate} animationDuration={620} />
      </BarChart>
    </ResponsiveContainer></div> : <ChartEmpty>Create a course to see lesson progress here.</ChartEmpty>}
  </Card>
}

export function StudyActivityChart({ data }: { data: StudyActivityPoint[] }) {
  const animate = useChartAnimation()
  const hasActivity = data.some((point) => point.lessons + point.tasks + point.focusSessions > 0)
  return <Card className="progress-chart-card" padding="medium">
    <div className="progress-chart-heading"><div><h3>Study activity</h3><p>Lessons, tasks, and focus sessions over two weeks</p></div></div>
    {hasActivity ? <div className="progress-chart"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={1} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 10 }} />
        <Bar dataKey="lessons" name="Lessons" stackId="activity" fill="var(--chart-primary)" isAnimationActive={animate} animationDuration={620} />
        <Bar dataKey="tasks" name="Tasks" stackId="activity" fill="var(--chart-secondary)" isAnimationActive={animate} animationDuration={620} />
        <Bar dataKey="focusSessions" name="Focus sessions" stackId="activity" fill="var(--chart-activity)" radius={[4, 4, 0, 0]} isAnimationActive={animate} animationDuration={620} />
      </BarChart>
    </ResponsiveContainer></div> : <ChartEmpty>No completed study activity recorded in the last two weeks.</ChartEmpty>}
  </Card>
}

export default function ProgressCharts({ weeklyFocus, focusTrend, courseProgress, activity }: {
  weeklyFocus: FocusChartPoint[]
  focusTrend: FocusChartPoint[]
  courseProgress: CourseChartPoint[]
  activity: StudyActivityPoint[]
}) {
  return <div className="progress-chart-grid">
    <WeeklyFocusTimeChart data={weeklyFocus} />
    <FocusActivityTrendChart data={focusTrend} />
    <CourseProgressChart data={courseProgress} />
    <StudyActivityChart data={activity} />
  </div>
}
