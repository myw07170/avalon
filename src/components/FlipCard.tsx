"use client";

/**
 * 3D 翻牌的机械部分。身份卡（RoleCard）与观战的身份牌堆（IdentityDeck）共用。
 *
 * 【只管翻，不管画什么】两处的牌面差着一个数量级——一张占半屏，一排十张只有拇指大。
 * 所以尺寸、比例、牌面内容全由调用方给，这里只负责那件两边都必须做对、
 * 又都容易做错的事：透视、backface、以及 reduced-motion。
 *
 * 【CSS perspective 必须在外层普通 div 上】在 motion.* 元素的 style 里，
 * perspective 被当成 transform 值（MotionCSS 把它从 CSSProperties 里删了，
 * TransformProperties 里另有一个同名的），写在那儿卡片会翻得是平的。
 *
 * 【reduced 由调用方传】useReducedMotion 是必须的：globals.css 里那条
 * prefers-reduced-motion 只管 CSS 过渡，管不到 framer-motion 这种 JS 驱动的动画。
 * 不在这里自己调 hook，是为了让一排十张牌只读一次那个偏好。
 */
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FlipCardProps {
  flipped: boolean;
  reduced: boolean;
  onToggle: () => void;
  /** 读屏软件念的那句话。翻开与盖上是两句，由调用方按 flipped 选 */
  label: string;
  /** 尺寸与比例。两处差得远，所以不给默认值 */
  className?: string;
  /** 盖着时看到的 */
  back: React.ReactNode;
  /** 翻开后看到的 */
  front: React.ReactNode;
}

export function FlipCard({
  flipped,
  reduced,
  onToggle,
  label,
  className,
  back,
  front,
}: FlipCardProps) {
  return (
    <div style={{ perspective: 1200 }} className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={flipped}
        aria-label={label}
        className="block size-full rounded-2xl"
      >
        <motion.div
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={
            reduced ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }
          }
          className="relative size-full"
        >
          <div style={{ backfaceVisibility: "hidden" }} className="absolute inset-0">
            {back}
          </div>
          <div
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            className="absolute inset-0"
          >
            {front}
          </div>
        </motion.div>
      </button>
    </div>
  );
}

/**
 * 卡背图案：还是那张桌子，黄铜细线的同心圆。
 *
 * 【尺寸走 className】大卡用 size-28，牌堆里的小牌用 size-8——同一个图案，
 * 两种密度。另画一套图案会让人以为那是两种牌。
 */
export function TableMotif({ className }: { className?: string }) {
  return (
    <div className={cn("relative mx-auto", className ?? "size-28")} aria-hidden>
      <div className="absolute inset-0 rounded-full border border-brass/30" />
      <div className="absolute inset-[18%] rounded-full border border-brass/20" />
      <div className="absolute inset-[42%] rounded-full border border-brass/50" />
    </div>
  );
}
