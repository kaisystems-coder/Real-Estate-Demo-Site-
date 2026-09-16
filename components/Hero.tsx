'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { BLUR_DATA_URL } from '@/lib/format';
import HeroSearch from './HeroSearch';

// The still that opens the section on every load, stays under the video
// until it can play, and is the whole picture for reduced-motion visitors,
// phones and any browser that can't play the clip.
const HERO_STILL =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=2000&q=74';

/**
 * Four properties, three seconds each, cross-dissolved into one reel.
 *
 * The long-running split-second blip in this loop was never an opacity,
 * z-index or mount-order problem — instrumenting `readyState` per layer
 * showed clips being revealed at HAVE_NOTHING, i.e. with no decoded frames,
 * so the browser painted an empty element and the page showed through.
 * The cause was four 1080p sources buffering concurrently and starving each
 * other. Measured on their own, every one of them is fine:
 *
 *   waterfront 1080p60  1532ms to readyState 4
 *   dock       1080p24   414ms
 *   twilight   1080p30   399ms
 *   courtyard  1080p30    29ms
 *
 * So the rule this build is designed around: never have more than two
 * sources in flight, and never reveal one until it says it is ready.
 */
const HERO_CLIPS = [
  // Waterfront estate: white walls, black-framed glass, lawn to the water.
  'https://videos.pexels.com/video-files/37028650/15687689_1920_1080_60fps.mp4',
  // Tropical dock: turquoise water, oval pool, private jetty.
  'https://videos.pexels.com/video-files/17404328/17404328-hd_1920_1080_24fps.mp4',
  // Twilight: the same register of villa, lit from inside as dusk falls.
  'https://videos.pexels.com/video-files/39024336/16605551_1920_1080_30fps.mp4',
  // Courtyard pool at ground level, palms growing through the water.
  'https://videos.pexels.com/video-files/36473810/15466363_1920_1080_30fps.mp4',
] as const;

// How long each property holds the screen, and how long the dissolve between
// them takes. The fade is part of the three seconds, not added to it.
const CLIP_SECONDS = 3;
const FADE_MS = 900;

// The footage is bright midday tropical light and runs much hotter than the
// still it sits over, which left the white headline and the search panel
// fighting the picture. Knocking it back and desaturating slightly puts it
// in the same register as the rest of the site's photography and gives the
// copy its contrast back.
const VIDEO_TONE = 'brightness(0.52) saturate(0.82)';

export default function Hero({ count }: { count: number }) {
  const reduce = useReducedMotion();
  // Below this, skip the video outright rather than shrink it — matches the
  // site's existing `sm` breakpoint for "phone vs. everything else".
  const [canPlayVideo, setCanPlayVideo] = useState(false);

  // Two fixed <video> elements. `top` is the one currently on screen; the
  // other sits beneath it, invisible, loading whatever comes next. They swap
  // roles on every beat, so there are never more than two sources in flight.
  const [layers, setLayers] = useState<{ a: string; b: string }>({
    a: HERO_CLIPS[0],
    b: HERO_CLIPS[1],
  });
  const [top, setTop] = useState<'a' | 'b'>('a');
  // Gate for the very first reveal, so the still holds until there is a
  // picture to replace it with. After that, readiness is checked directly off
  // the standby element on each beat (see the interval below).
  const [started, setStarted] = useState(false);
  // The layer that is on its way out. It is held fully opaque underneath the
  // incoming one for the length of the fade rather than fading in step with
  // it: two layers crossing in opposite directions sum to less than one in
  // the middle, which let the still bleed through and visibly lightened the
  // hero on every swap. Only the incoming layer animates; the outgoing one
  // is simply covered, then dropped once it is hidden.
  const [fadingOut, setFadingOut] = useState<'a' | 'b' | null>(null);

  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const clipCursor = useRef(1);

  useEffect(() => {
    if (reduce) return;
    const mq = window.matchMedia('(min-width: 640px)');
    const update = () => setCanPlayVideo(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [reduce]);

  // The beat. Every CLIP_SECONDS, hand over to the standby layer — but only
  // once that layer actually has frames. Readiness is read straight off the
  // element rather than from state, so the interval always sees the truth at
  // the instant it fires. If the next clip is still buffering the current one
  // simply holds the screen and we try again on the next beat: a property
  // lingering an extra three seconds is invisible, an empty frame is not.
  useEffect(() => {
    if (!canPlayVideo) return;
    const tick = setInterval(() => {
      setTop((current) => {
        const standby = current === 'a' ? videoB.current : videoA.current;
        if (!standby || standby.readyState < 3) return current;
        setFadingOut(current);
        return current === 'a' ? 'b' : 'a';
      });
    }, CLIP_SECONDS * 1000);
    return () => clearInterval(tick);
  }, [canPlayVideo]);

  // Once the swap has landed and the old top layer is safely hidden, point it
  // at the next clip in the reel. Waiting out the fade means its src is never
  // reassigned while any part of it is on screen — which is what previously
  // let a repaint show through mid-dissolve.
  useEffect(() => {
    if (!canPlayVideo || !started) return;
    const hidden = top === 'a' ? 'b' : 'a';
    const queue = setTimeout(() => {
      // The incoming layer now fully covers the outgoing one, so it is safe
      // both to stop holding it opaque and to repoint it at the next clip.
      setFadingOut(null);
      clipCursor.current = (clipCursor.current + 1) % HERO_CLIPS.length;
      setLayers((prev) => ({ ...prev, [hidden]: HERO_CLIPS[clipCursor.current] }));
    }, FADE_MS + 100);
    return () => clearTimeout(queue);
  }, [canPlayVideo, started, top]);

  // Entrance is a short orchestrated sequence, and every element's resting
  // state is visible — the animation only offsets it.
  const rise = (delay: number) =>
    reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section className="on-ink relative isolate overflow-hidden bg-ink">
      {/* `isolate` makes this its own stacking context, so the z-indices the
          clips use to order the dissolve cannot outrank the copy that
          follows this wrapper. `z-0` keeps the whole media stack behind it. */}
      <div className="absolute inset-0 isolate z-0">
        {/* The still, and the backstop the video rests on. It is never faded
            out: it sits at full opacity behind the clip for the life of the
            page, so if the video stalls, buffers or fails outright what shows
            is this photograph rather than the dark page. It is also the whole
            picture for phones, reduced-motion visitors, and any browser that
            cannot play the clip. */}
        <div className="grain absolute inset-0">
          <Image
            src={HERO_STILL}
            alt=""
            aria-hidden
            fill
            priority
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>

        {/* The reel: two fixed players that alternate. No grain and no blur —
            moving footage reads any added texture as noise rather than
            warmth. Phones and reduced-motion visitors never get these at all.

            Whichever is `top` is visible and playing; the other is pinned
            transparent underneath, loading the next property. Neither element
            is ever unmounted and neither has its src reassigned while any
            part of it is on screen, so there is no repaint for a dissolve to
            expose. Both sit at full opacity over the still, so even a dropped
            frame shows the photograph rather than the page. */}
        {canPlayVideo &&
          (['a', 'b'] as const).map((slot) => {
            const isTop = top === slot;
            const isFadingOut = fadingOut === slot;
            // Visible if it is the incoming layer, or if it is the outgoing
            // one still being covered. Only the incoming layer transitions.
            const visible = (isTop && started) || isFadingOut;
            return (
              <video
                key={slot}
                ref={slot === 'a' ? videoA : videoB}
                aria-hidden
                muted
                loop
                autoPlay
                playsInline
                preload="auto"
                src={layers[slot]}
                onCanPlayThrough={() => {
                  if (isTop) setStarted(true);
                }}
                style={{
                  filter: VIDEO_TONE,
                  zIndex: isTop ? 1 : 0,
                  opacity: visible ? 1 : 0,
                  // Only the incoming layer animates. The outgoing one snaps
                  // between states while it is safely covered, so the two can
                  // never sum to less than a fully opaque picture.
                  transitionDuration: isTop ? `${reduce ? 200 : FADE_MS}ms` : '0ms',
                }}
                className="absolute inset-0 h-full w-full object-cover object-center transition-opacity ease-out"
              />
            );
          })}

        {/* Two scrims: one lifts the copy off the left, one grounds the base
            so the section meets the bone page without a hard seam. Both are
            weighted to the left and bottom — where the headline and the search
            panel sit — so the building stays legible on the right instead of
            being flattened to near-black. Measured, not eyeballed: white copy
            keeps ~9:1 over the darkest band it crosses, well past the 4.5:1
            floor, while the photo reads about twice as bright as before.

            These sit above the video simply by coming after it in the DOM,
            and deliberately carry no z-index of their own — the whole media
            stack is contained by the wrapper's own stacking context (see the
            `isolate z-0` on it) rather than leaking out to outrank the copy
            in the next sibling. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-ink via-ink/80 to-ink/25 sm:via-ink/72 sm:to-ink/20"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-ink/45 sm:via-ink/25 sm:to-ink/35"
        />
        {/* A soft plate under the copy column only. The photo has a bright
            window band that lands behind the eyebrow at phone widths, where
            the text column spans the full frame; without this the gold drops
            to ~1:1 against it. Fades out by 60% so the building is untouched. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(18,19,15,0)_14%,rgba(18,19,15,0.42)_25%,rgba(18,19,15,0.42)_40%,rgba(18,19,15,0)_52%)] sm:bg-[radial-gradient(95%_80%_at_0%_42%,rgba(18,19,15,0.42)_0%,rgba(18,19,15,0.22)_40%,rgba(18,19,15,0)_70%)]"
        />
      </div>

      <div className="relative mx-auto max-w-[82rem] px-5 pb-14 pt-[9.5rem] sm:px-8 sm:pb-16 sm:pt-[11rem]">
        <div className="max-w-[44rem]">
          <motion.p
            {...rise(0.05)}
            className="text-[0.72rem] uppercase tracking-[0.24em] text-gold"
          >
            Licensed since 2009
          </motion.p>

          <motion.h1
            {...rise(0.12)}
            className="mt-4 font-display text-[2.25rem] leading-[1.06] tracking-display text-bone xs:text-[2.5rem] sm:text-[3.6rem] lg:text-[4.1rem]"
          >
            Find your place
            {/* The gold line is one phrase: a nbsp before Tobago keeps
                "& Tobago." from being stranded alone on a third line at
                390px, where the ampersand would otherwise wrap by itself. */}
            <span className="block [text-wrap:pretty] text-gold">
              in Trinidad &amp;&nbsp;Tobago.
            </span>
          </motion.h1>

          <motion.p
            {...rise(0.2)}
            className="mt-5 max-w-[34rem] text-[1rem] leading-[1.7] text-bone/65"
          >
            Houses, apartments, land and commercial space from Westmoorings to Bon
            Accord. Every listing measured, photographed and priced in TTD.
          </motion.p>
        </div>

        <HeroSearch count={count} />
      </div>
    </section>
  );
}
