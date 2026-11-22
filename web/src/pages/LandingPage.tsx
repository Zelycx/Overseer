import { useEffect, useRef, type RefObject } from 'react'
import { ArrowDown, ArrowRight, BookOpen, CalendarDays, ChartNoAxesCombined, Clock3, ListTodo, NotebookPen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppData } from '../app/AppDataContext'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP)

const features = [
  { number: '01', title: 'Schedule', detail: 'Keep classes, study blocks, and the rest of the week in view.', to: '/schedule', icon: CalendarDays },
  { number: '02', title: 'Day planner', detail: 'Shape a realistic plan from the time you actually have.', to: '/day-planner', icon: NotebookPen },
  { number: '03', title: 'Tasks', detail: 'Collect next steps, due dates, and course work in one list.', to: '/tasks', icon: ListTodo },
  { number: '04', title: 'Study library', detail: 'Keep courses, lessons, and study materials together.', to: '/library', icon: BookOpen },
  { number: '05', title: 'Focus timer', detail: 'Start a session, take a break, and keep a local history.', to: '/focus', icon: Clock3 },
  { number: '06', title: 'Progress', detail: 'See completed work and focus time add up over time.', to: '/progress', icon: ChartNoAxesCombined },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function polarPoint(radius: number, angle: number) {
  const radians = (angle * Math.PI) / 180
  return { x: 500 + Math.cos(radians) * radius, y: 282 + Math.sin(radians) * radius }
}

function aperturePath(openness: number) {
  const open = clamp(openness, 0, 1)
  const center = 282 + 12 * (1 - open)
  const upperControl = center - 150 * open
  const upperEdge = center - 216 * open
  const lowerControl = center + 150 * open
  const lowerEdge = center + 216 * open
  return `M92 282 C204 ${upperControl} 342 ${upperEdge} 500 ${upperEdge} C658 ${upperEdge} 796 ${upperControl} 908 282 C796 ${lowerControl} 658 ${lowerEdge} 500 ${lowerEdge} C342 ${lowerEdge} 204 ${lowerControl} 92 282Z`
}

const irisFibers = Array.from({ length: 56 }, (_, index) => {
  const angle = (index / 56) * 360 + Math.sin(index * 9.17) * 1.8 + Math.cos(index * 2.61) * 1.2
  const inner = 73 + ((index * 17) % 31) + Math.sin(index * 4.3) * 5
  const outer = 147 + ((index * 13) % 23) + Math.cos(index * 3.4) * 5
  const bend = Math.sin(index * 7.1) * 5.5
  const start = polarPoint(inner, angle)
  const end = polarPoint(outer, angle + bend * 0.14)
  const control = polarPoint((inner + outer) / 2, angle + bend)
  return {
    d: 'M' + start.x.toFixed(1) + ' ' + start.y.toFixed(1) + ' Q' + control.x.toFixed(1) + ' ' + control.y.toFixed(1) + ' ' + end.x.toFixed(1) + ' ' + end.y.toFixed(1),
    width: (0.65 + ((index * 7) % 13) / 8).toFixed(2),
    opacity: (0.25 + ((index * 11) % 13) / 22).toFixed(2),
    color: index % 5 === 0 ? 'var(--accent-color)' : 'var(--eye-fiber)',
  }
})

const irisFlecks = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * 360 + Math.sin(index * 5.2) * 8
  const radius = 112 + ((index * 19) % 32)
  const point = polarPoint(radius, angle)
  return { ...point, rx: 1.2 + (index % 3) * 0.45, ry: 2.2 + (index % 4) * 0.55, rotate: angle + 90, opacity: 0.24 + (index % 5) * 0.1 }
})

const irisCrypts = Array.from({ length: 12 }, (_, index) => {
  const angle = index * 30 + Math.sin(index * 2.9) * 5
  const start = polarPoint(88 + (index % 3) * 4, angle - 3)
  const end = polarPoint(103 + (index % 4) * 4, angle + 3)
  const control = polarPoint(96 + (index % 3) * 4, angle + Math.sin(index * 5) * 8)
  return 'M' + start.x.toFixed(1) + ' ' + start.y.toFixed(1) + ' Q' + control.x.toFixed(1) + ' ' + control.y.toFixed(1) + ' ' + end.x.toFixed(1) + ' ' + end.y.toFixed(1)
})

function Observatory({ irisRef, irisDetailRef, pupilRef, apertureRef, contourRef, lidAccentsRef }: {
  irisRef: RefObject<SVGGElement | null>
  irisDetailRef: RefObject<SVGGElement | null>
  pupilRef: RefObject<SVGGElement | null>
  apertureRef: RefObject<SVGPathElement | null>
  contourRef: RefObject<SVGPathElement | null>
  lidAccentsRef: RefObject<SVGGElement | null>
}) {
  return (
    <div className="observatory" role="group" aria-label="Overseer study workspace">
      <svg className="observatory__art" viewBox="0 0 1000 620" role="img" aria-labelledby="observatory-title observatory-description">
        <title id="observatory-title">Overseer</title>
        <desc id="observatory-description">A layered eye with an olive iris, fine radial fibers, soft reflections, and sculpted lids.</desc>
        <defs>
          <linearGradient id="sclera-wash" x1="0" y1="0" x2=".12" y2="1">
            <stop offset="0" stopColor="var(--eye-sclera-highlight)" />
            <stop offset=".48" stopColor="var(--eye-sclera)" />
            <stop offset="1" stopColor="var(--eye-sclera-shadow)" />
          </linearGradient>
          <radialGradient id="iris-wash" cx="44%" cy="35%" r="68%">
            <stop offset="0" stopColor="var(--eye-iris-light)" />
            <stop offset=".34" stopColor="var(--eye-iris-mid)" />
            <stop offset=".73" stopColor="var(--eye-iris-deep)" />
            <stop offset="1" stopColor="var(--eye-iris-edge)" />
          </radialGradient>
          <radialGradient id="pupil-wash" cx="35%" cy="27%" r="80%">
            <stop offset="0" stopColor="var(--eye-pupil-light)" />
            <stop offset=".5" stopColor="var(--eye-pupil)" />
            <stop offset="1" stopColor="var(--eye-pupil-edge)" />
          </radialGradient>
          <linearGradient id="lid-shine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--eye-lid-highlight)" stopOpacity=".66" />
            <stop offset="1" stopColor="var(--eye-lid-shadow)" stopOpacity=".1" />
          </linearGradient>
          <radialGradient id="iris-glass" cx="36%" cy="22%" r="74%">
            <stop offset="0" stopColor="white" stopOpacity=".26" />
            <stop offset=".48" stopColor="white" stopOpacity=".055" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <clipPath id="eye-aperture">
            <path ref={apertureRef} d={aperturePath(1)} />
          </clipPath>
          <filter id="eye-soft-shadow" x="-10%" y="-14%" width="120%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="eye-small-shadow" x="-20%" y="-50%" width="140%" height="200%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
        </defs>

        <g className="observatory__orbits" fill="none" stroke="currentColor">
          <ellipse cx="500" cy="282" rx="446" ry="224" className="orbit orbit--outer" />
          <ellipse cx="500" cy="282" rx="405" ry="193" className="orbit orbit--dashed" />
          <ellipse cx="500" cy="282" rx="358" ry="164" className="orbit orbit--thin" />
        </g>

        <g className="observatory__eye">
          <path className="observatory__eye-shadow" d="M76 285 C190 122 337 54 500 54 C663 54 810 122 924 285 C810 448 663 516 500 516 C337 516 190 448 76 285Z" fill="var(--eye-shadow)" filter="url(#eye-soft-shadow)" />
          <path d="M92 282 C204 132 342 66 500 66 C658 66 796 132 908 282 C796 432 658 498 500 498 C342 498 204 432 92 282Z" fill="url(#sclera-wash)" clipPath="url(#eye-aperture)" />
          <path d="M103 282 C218 148 350 83 500 83 C650 83 782 148 897 282 C782 416 650 481 500 481 C350 481 218 416 103 282Z" fill="none" stroke="var(--eye-sclera-highlight)" strokeOpacity=".58" strokeWidth="1.1" clipPath="url(#eye-aperture)" />
          <g clipPath="url(#eye-aperture)">
            <path d="M72 255 C190 127 340 70 500 70 C660 70 810 127 928 255 L928 70 L72 70Z" fill="url(#lid-shine)" opacity=".68" />
            <path d="M105 287 C229 218 365 187 500 187 C635 187 771 218 895 287 C774 245 643 229 500 229 C357 229 226 245 105 287Z" fill="var(--eye-lid-shadow)" opacity=".08" />
            <ellipse cx="500" cy="441" rx="310" ry="37" fill="var(--eye-lid-shadow)" opacity=".11" filter="url(#eye-small-shadow)" />
            <g ref={irisRef} className="observatory__iris-assembly">
              <circle cx="500" cy="282" r="171" fill="url(#iris-wash)" stroke="var(--eye-iris-edge)" strokeWidth="5" />
              <circle cx="500" cy="282" r="166" fill="none" stroke="var(--eye-iris-light)" strokeOpacity=".56" strokeWidth="1" />
              <circle cx="500" cy="282" r="157" fill="none" stroke="var(--eye-iris-edge)" strokeOpacity=".45" strokeWidth="2" />
              <g ref={irisDetailRef} className="observatory__iris-detail">
                <path className="observatory__iris-reflection" d="M500 114 A168 168 0 0 1 650 206" fill="none" stroke="url(#iris-glass)" strokeWidth="26" strokeLinecap="round" opacity=".66" />
                <g className="observatory__iris-fibers" fill="none" strokeLinecap="round">
                  {irisFibers.map((fiber, index) => <path key={index} d={fiber.d} stroke={fiber.color} strokeWidth={fiber.width} strokeOpacity={fiber.opacity} />)}
                </g>
                <g fill="none" stroke="var(--eye-crypt)" strokeLinecap="round" strokeOpacity=".48">
                  {irisCrypts.map((d, index) => <path key={index} d={d} strokeWidth={index % 3 === 0 ? 2 : 1.3} />)}
                </g>
                <g className="observatory__iris-flecks" fill="var(--eye-fleck)">
                  {irisFlecks.map((fleck, index) => <ellipse key={index} cx={fleck.x} cy={fleck.y} rx={fleck.rx} ry={fleck.ry} opacity={fleck.opacity} transform={'rotate(' + fleck.rotate + ' ' + fleck.x + ' ' + fleck.y + ')'} />)}
                </g>
                <circle cx="500" cy="282" r="139" fill="none" stroke="var(--eye-iris-light)" strokeOpacity=".24" strokeWidth="1.2" />
                <circle cx="500" cy="282" r="123" fill="none" stroke="var(--eye-iris-edge)" strokeOpacity=".38" strokeWidth="2.2" strokeDasharray="1 4" />
                <circle cx="500" cy="282" r="106" fill="none" stroke="var(--eye-iris-light)" strokeOpacity=".25" strokeWidth="1.1" />
                <circle cx="500" cy="282" r="95" fill="none" stroke="var(--accent-color)" strokeOpacity=".54" strokeWidth="2" strokeDasharray="1 7" />
                <circle cx="500" cy="282" r="82" fill="none" stroke="var(--eye-iris-edge)" strokeOpacity=".58" strokeWidth="2" />
                <circle cx="500" cy="282" r="73" fill="none" stroke="var(--eye-iris-light)" strokeOpacity=".35" strokeWidth="1" />
                <g ref={pupilRef} className="observatory__pupil">
                  <circle cx="500" cy="282" r="61" fill="url(#pupil-wash)" />
                  <circle cx="500" cy="282" r="61" fill="none" stroke="var(--eye-pupil-edge)" strokeWidth="2" />
                  <circle cx="500" cy="282" r="55" fill="none" stroke="var(--eye-pupil-light)" strokeOpacity=".28" strokeWidth="1" />
                  <ellipse cx="483" cy="258" rx="13" ry="7" fill="white" opacity=".38" transform="rotate(-29 483 258)" />
                  <circle cx="478" cy="267" r="4" fill="white" opacity=".58" />
                  <circle cx="530" cy="302" r="2.2" fill="var(--accent-color)" opacity=".8" />
                  <circle cx="467" cy="299" r="1.5" fill="white" opacity=".48" />
                </g>
              </g>
            </g>
            <path d="M188 344 C287 390 390 412 500 412 C610 412 713 390 812 344" fill="none" stroke="var(--eye-sclera-shadow)" strokeOpacity=".48" strokeWidth="1.4" />
            <path d="M218 188 C309 132 404 109 500 109 C596 109 691 132 782 188" fill="none" stroke="var(--eye-sclera-highlight)" strokeOpacity=".34" strokeWidth="1.2" />
          </g>
          <path ref={contourRef} d={aperturePath(1)} fill="none" stroke="var(--eye-lid-edge)" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
          <g ref={lidAccentsRef}>
            <path d="M107 277 C229 139 362 83 500 83 C638 83 771 139 893 277" fill="none" stroke="var(--eye-lid-highlight)" strokeOpacity=".76" strokeWidth="1.35" strokeLinecap="round" />
            <path d="M92 282 C204 432 342 498 500 498 C658 498 796 432 908 282" fill="none" stroke="var(--eye-lid-edge)" strokeOpacity=".46" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M132 330 C245 429 366 465 500 465 C634 465 755 429 864 330" fill="none" stroke="var(--eye-lid-shadow)" strokeOpacity=".42" strokeWidth="8" strokeLinecap="round" />
            <path d="M136 330 C245 429 366 465 500 465 C634 465 755 429 864 330" fill="none" stroke="var(--eye-lid-highlight)" strokeOpacity=".54" strokeWidth="1.2" strokeLinecap="round" />
          </g>
        </g>
      </svg>

      <Link className="observatory-node observatory-node--schedule" to="/schedule"><span className="observatory-node__index">01</span><span>Schedule</span><ArrowRight size={13} /></Link>
      <Link className="observatory-node observatory-node--planner" to="/day-planner"><span className="observatory-node__index">02</span><span>Day planner</span><ArrowRight size={13} /></Link>
      <Link className="observatory-node observatory-node--tasks" to="/tasks"><span className="observatory-node__index">03</span><span>Tasks</span><ArrowRight size={13} /></Link>
      <Link className="observatory-node observatory-node--library" to="/library"><span className="observatory-node__index">04</span><span>Courses &amp; materials</span><ArrowRight size={13} /></Link>
      <Link className="observatory-node observatory-node--focus" to="/focus"><span className="observatory-node__index">05</span><span>Focus</span><ArrowRight size={13} /></Link>
      <Link className="observatory-node observatory-node--progress" to="/progress"><span className="observatory-node__index">06</span><span>Progress</span><ArrowRight size={13} /></Link>
    </div>
  )
}

export default function LandingPage() {
  const { data } = useAppData()
  const pageRef = useRef<HTMLDivElement>(null)
  const observatoryRef = useRef<HTMLDivElement>(null)
  const irisRef = useRef<SVGGElement>(null)
  const irisDetailRef = useRef<SVGGElement>(null)
  const pupilRef = useRef<SVGGElement>(null)
  const apertureRef = useRef<SVGPathElement>(null)
  const contourRef = useRef<SVGPathElement>(null)
  const lidAccentsRef = useRef<SVGGElement>(null)
  const flashlightRef = useRef<HTMLSpanElement>(null)

  useGSAP((_, contextSafe) => {
    const aperture = apertureRef.current
    const contour = contourRef.current
    const accents = lidAccentsRef.current
    const systemMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!aperture || !contour || !accents || !contextSafe || data.preferences.reducedMotion) return

    let timeout = 0
    let timeline: gsap.core.Timeline | undefined
    let openness = { value: 1 }
    let runBlink: (doubleBlink?: boolean) => void = () => undefined
    const restore = () => {
      openness.value = 1
      const path = aperturePath(1)
      aperture.setAttribute('d', path)
      contour.setAttribute('d', path)
      accents.style.opacity = '1'
    }
    const schedule = (delay?: number, doubleBlink = false) => {
      window.clearTimeout(timeout)
      if (!systemMotion.matches) timeout = window.setTimeout(() => runBlink(doubleBlink), delay ?? 5600 + Math.random() * 3600)
    }

    runBlink = contextSafe((doubleBlink = false) => {
      if (systemMotion.matches) return
      openness = { value: 1 }
      const setOpening = () => {
        const path = aperturePath(openness.value)
        aperture.setAttribute('d', path)
        contour.setAttribute('d', path)
        accents.style.opacity = String(Math.min(1, openness.value * 1.7))
      }
      const doubleAfter = !doubleBlink && Math.random() < 0.16
      timeline = gsap.timeline({ onComplete: () => schedule(doubleAfter ? 210 + Math.random() * 80 : undefined, doubleAfter) })
        .to(openness, { value: 0, duration: (doubleBlink ? 0.085 : 0.105) + Math.random() * 0.025, ease: 'power3.in', onUpdate: setOpening })
        .to(openness, { value: 0, duration: 0.11 + Math.random() * 0.03, ease: 'none', onUpdate: setOpening })
        .to(openness, { value: 1, duration: (doubleBlink ? 0.14 : 0.17) + Math.random() * 0.055, ease: 'power2.out', onUpdate: setOpening })
    })
    const syncSystemMotion = () => {
      if (systemMotion.matches) {
        window.clearTimeout(timeout)
        timeline?.kill()
        restore()
      } else schedule()
    }

    schedule(4200 + Math.random() * 2000)
    systemMotion.addEventListener('change', syncSystemMotion)
    return () => {
      window.clearTimeout(timeout)
      timeline?.kill()
      systemMotion.removeEventListener('change', syncSystemMotion)
      restore()
    }
  }, { scope: observatoryRef, dependencies: [data.preferences.reducedMotion], revertOnUpdate: true })

  useEffect(() => {
    const page = pageRef.current
    const eye = observatoryRef.current?.querySelector<SVGGElement>('.observatory__eye')
    const iris = irisRef.current
    const irisDetail = irisDetailRef.current
    const pupil = pupilRef.current
    const flashlight = flashlightRef.current
    if (!page || !eye || !iris || !irisDetail || !pupil || !flashlight) return

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let motionAllowed = finePointer.matches && !reducedMotion.matches && !data.preferences.reducedMotion
    let frame = 0
    let idleTimer = 0
    let idleReturnTimer = 0
    let targetX = window.innerWidth / 2
    let targetY = window.innerHeight / 2
    let currentX = targetX
    let currentY = targetY
    let targetEyeX = 0
    let targetEyeY = 0
    let eyeX = 0
    let eyeY = 0
    let hoveredMagnet: HTMLElement | null = null
    let pointerActive = false

    const resetMagnet = () => {
      if (!hoveredMagnet) return
      hoveredMagnet.style.setProperty('--mag-x', '0px')
      hoveredMagnet.style.setProperty('--mag-y', '0px')
      hoveredMagnet = null
    }

    const animate = () => {
      currentX += (targetX - currentX) * .2
      currentY += (targetY - currentY) * .2
      eyeX += (targetEyeX - eyeX) * .16
      eyeY += (targetEyeY - eyeY) * .16
      const bounds = eye.getBoundingClientRect()
      const originX = bounds.left + bounds.width * .5
      const originY = bounds.top + bounds.height * .5
      const distance = Math.hypot(currentX - originX, currentY - originY)
      page.style.setProperty('--spot-x', currentX + 'px')
      page.style.setProperty('--spot-y', currentY + 'px')
      page.style.setProperty('--eye-x', originX + 'px')
      page.style.setProperty('--eye-y', originY + 'px')
      page.style.setProperty('--beam-angle', Math.atan2(currentY - originY, currentX - originX) + 'rad')
      page.style.setProperty('--beam-length', distance + 'px')
      iris.style.transform = 'translate3d(' + eyeX * 4 + 'px, ' + eyeY * 3 + 'px, 0) rotate(' + eyeX * .48 + 'deg)'
      irisDetail.style.transform = 'translate3d(' + eyeX * .75 + 'px, ' + eyeY * .55 + 'px, 0) rotate(' + eyeX * .2 + 'deg)'
      pupil.style.transform = 'translate3d(' + eyeX * .55 + 'px, ' + eyeY * .4 + 'px, 0)'
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetEyeX - eyeX) + Math.abs(targetEyeY - eyeY) < .35) {
        currentX = targetX
        currentY = targetY
        eyeX = targetEyeX
        eyeY = targetEyeY
        frame = 0
        return
      }
      frame = window.requestAnimationFrame(animate)
    }

    const updateGaze = () => {
      if (!motionAllowed || !pointerActive) return
      const bounds = eye.getBoundingClientRect()
      targetEyeX = clamp((targetX - (bounds.left + bounds.width / 2)) / Math.max(window.innerWidth * .52, 1), -1, 1)
      targetEyeY = clamp((targetY - (bounds.top + bounds.height / 2)) / Math.max(window.innerHeight * .58, 1), -1, 1)
      if (!frame) frame = window.requestAnimationFrame(animate)
    }

    const scheduleIdleDrift = () => {
      window.clearTimeout(idleTimer)
      if (!motionAllowed || pointerActive) return
      idleTimer = window.setTimeout(() => {
        if (!motionAllowed || pointerActive) return
        targetEyeX = (Math.random() - .5) * .3
        targetEyeY = (Math.random() - .5) * .24
        if (!frame) frame = window.requestAnimationFrame(animate)
        idleReturnTimer = window.setTimeout(() => {
          if (!motionAllowed || pointerActive) return
          targetEyeX = 0
          targetEyeY = 0
          if (!frame) frame = window.requestAnimationFrame(animate)
          scheduleIdleDrift()
        }, 650 + Math.random() * 350)
      }, 5200 + Math.random() * 4200)
    }

    const move = (event: PointerEvent) => {
      if (!motionAllowed || event.pointerType === 'touch') return
      const target = event.target instanceof Element ? event.target : null
      if (!target || !page.contains(target)) return
      window.clearTimeout(idleTimer)
      window.clearTimeout(idleReturnTimer)
      pointerActive = true
      page.dataset.pointerActive = 'true'
      targetX = event.clientX
      targetY = event.clientY
      updateGaze()

      const magnetic = target.closest<HTMLElement>('.landing-magnetic')
      if (magnetic !== hoveredMagnet) resetMagnet()
      hoveredMagnet = magnetic
      if (magnetic) {
        const rect = magnetic.getBoundingClientRect()
        magnetic.style.setProperty('--mag-x', clamp((event.clientX - rect.left - rect.width / 2) * .07, -4, 4) + 'px')
        magnetic.style.setProperty('--mag-y', clamp((event.clientY - rect.top - rect.height / 2) * .09, -4, 4) + 'px')
      }
    }

    const leave = () => {
      if (!motionAllowed) return
      pointerActive = false
      delete page.dataset.pointerActive
      targetEyeX = 0
      targetEyeY = 0
      resetMagnet()
      if (!frame) frame = window.requestAnimationFrame(animate)
      scheduleIdleDrift()
    }

    const syncMotionPreference = () => {
      motionAllowed = finePointer.matches && !reducedMotion.matches && !data.preferences.reducedMotion
      if (motionAllowed) { scheduleIdleDrift(); return }
      window.clearTimeout(idleTimer)
      window.clearTimeout(idleReturnTimer)
      pointerActive = false
      delete page.dataset.pointerActive
      targetEyeX = targetEyeY = eyeX = eyeY = 0
      iris.style.removeProperty('transform')
      irisDetail.style.removeProperty('transform')
      pupil.style.removeProperty('transform')
      page.style.removeProperty('--spot-x')
      page.style.removeProperty('--spot-y')
      page.style.removeProperty('--eye-x')
      page.style.removeProperty('--eye-y')
      page.style.removeProperty('--beam-angle')
      page.style.removeProperty('--beam-length')
      flashlight.style.removeProperty('transform')
      resetMagnet()
      if (frame) window.cancelAnimationFrame(frame)
      frame = 0
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('scroll', updateGaze, { passive: true })
    window.addEventListener('resize', updateGaze, { passive: true })
    page.addEventListener('pointerleave', leave)
    reducedMotion.addEventListener('change', syncMotionPreference)
    finePointer.addEventListener('change', syncMotionPreference)
    scheduleIdleDrift()

    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('scroll', updateGaze)
      window.removeEventListener('resize', updateGaze)
      page.removeEventListener('pointerleave', leave)
      reducedMotion.removeEventListener('change', syncMotionPreference)
      finePointer.removeEventListener('change', syncMotionPreference)
      resetMagnet()
      window.clearTimeout(idleTimer)
      window.clearTimeout(idleReturnTimer)
      if (frame) window.cancelAnimationFrame(frame)
      iris.style.removeProperty('transform')
      irisDetail.style.removeProperty('transform')
      pupil.style.removeProperty('transform')
      page.style.removeProperty('--spot-x')
      page.style.removeProperty('--spot-y')
      page.style.removeProperty('--eye-x')
      page.style.removeProperty('--eye-y')
      page.style.removeProperty('--beam-angle')
      page.style.removeProperty('--beam-length')
      delete page.dataset.pointerActive
    }
  }, [data.preferences.reducedMotion])

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const items = Array.from(page.querySelectorAll<HTMLElement>('[data-reveal]'))
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const revealAll = () => items.forEach((item) => item.classList.add('is-visible'))
    const reducedMotion = motionPreference.matches || data.preferences.reducedMotion
    let observer: IntersectionObserver | null = null
    if (reducedMotion || !('IntersectionObserver' in window)) revealAll()
    else observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer?.unobserve(entry.target)
      })
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' })
    if (observer) items.forEach((item) => observer.observe(item))
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) revealAll()
    }
    motionPreference.addEventListener('change', onMotionPreferenceChange)
    return () => {
      observer?.disconnect()
      motionPreference.removeEventListener('change', onMotionPreferenceChange)
    }
  }, [data.preferences.reducedMotion])

  useEffect(() => {
    const page = pageRef.current
    const observatory = observatoryRef.current
    if (!page || !observatory) return
    let frame = 0
    const updateScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const bounds = observatory.getBoundingClientRect()
        const progress = clamp((window.innerHeight - bounds.top) / (window.innerHeight + bounds.height), 0, 1)
        page.style.setProperty('--scroll-progress', String(progress))
      })
    }
    window.addEventListener('scroll', updateScroll, { passive: true })
    updateScroll()
    return () => {
      window.removeEventListener('scroll', updateScroll)
      if (frame) window.cancelAnimationFrame(frame)
      page.style.removeProperty('--scroll-progress')
    }
  }, [])

  return (
    <div className="landing-page" ref={pageRef}>
      <span className="landing-flashlight" ref={flashlightRef} aria-hidden="true" />
      <header className="landing-nav">
        <Link to="/" className="landing-wordmark" aria-label="Overseer home">Overseer</Link>
        <nav aria-label="Main menu">
          <a href="#features">The workspace</a>
          <Link className="landing-nav__workspace" to="/dashboard">Open workspace <ArrowRight size={15} aria-hidden="true" /></Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__intro">
            <h1 id="landing-title">Overseer</h1>
            <div className="landing-hero__statement">
              <p>Your schedule, coursework, tasks, and focus sessions in one workspace.</p>
              <div className="landing-hero__actions">
                <Link className="landing-action landing-action--primary landing-magnetic" to="/dashboard">Open workspace <ArrowRight size={16} aria-hidden="true" /></Link>
                <a className="landing-action landing-action--text" href="#features">Explore the workspace <ArrowDown size={14} aria-hidden="true" /></a>
              </div>
            </div>
          </div>

          <div className="landing-hero__scene" ref={observatoryRef}>
            <div className="scene-glow" aria-hidden="true" />
            <div className="scene-rule scene-rule--left" aria-hidden="true" />
            <div className="scene-rule scene-rule--right" aria-hidden="true" />
            <Observatory irisRef={irisRef} irisDetailRef={irisDetailRef} pupilRef={pupilRef} apertureRef={apertureRef} contourRef={contourRef} lidAccentsRef={lidAccentsRef} />
          </div>
          <div className="landing-hero__footnote"><span>Planning, learning, and making progress</span><a href="#features" aria-label="Scroll to workspace features"><ArrowDown size={15} /></a></div>
        </section>

        <section className="landing-features" id="features" aria-labelledby="features-title">
          <div className="landing-features__intro" data-reveal>
            <h2 id="features-title">Your study<br />workspace.</h2>
            <p>Move between planning, coursework, and progress without losing your place.</p>
            <Link to="/dashboard" className="landing-inline-link">Enter your workspace <ArrowRight size={15} /></Link>
          </div>
          <div className="feature-sequence">
            {features.map(({ number, title, detail, to, icon: Icon }) => (
              <Link className="feature-line" to={to} key={number} data-reveal>
                <span className="feature-line__number">{number}</span>
                <span className="feature-line__icon"><Icon size={17} strokeWidth={1.6} aria-hidden="true" /></span>
                <span className="feature-line__copy"><strong>{title}</strong><small>{detail}</small></span>
                <span className="feature-line__arrow" aria-hidden="true"><ArrowRight size={16} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="landing-close" data-reveal>
          <span className="landing-close__rule" aria-hidden="true" />
          <p>Everything stays in your browser.</p>
          <Link className="landing-action landing-action--primary landing-magnetic" to="/dashboard">Open workspace <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <Link to="/" className="landing-wordmark" aria-label="Overseer home">Overseer</Link>
        <small>© {new Date().getFullYear()} Overseer · Local workspace</small>
      </footer>
    </div>
  )
}
