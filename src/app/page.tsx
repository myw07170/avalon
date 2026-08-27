import { GameShell } from "@/components/GameShell";

/**
 * 保持 server component。metadata 只能从 server component 导出，
 * 而且这样 @/store/game 的 atoms 不会被拖进这一层——
 * 那个文件的 "use client" 就是为了让这种误用在构建期炸掉。
 */
export default function Home() {
  return <GameShell />;
}
