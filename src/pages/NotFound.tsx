import { Link } from "react-router-dom";
import { Logo } from "@/components/app/Logo";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center"><Logo /></header>
      <main className="container-page grid flex-1 place-items-center py-16 text-center">
        <div>
          <p className="em text-[5rem] leading-none text-needle">404</p>
          <h1 className="mt-4 text-h2">This page wandered off the map.</h1>
          <p className="mt-3 text-ink-3">The link may be old, or the page may have moved.</p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/" className={buttonVariants()}>Go home</Link>
            <Link to="/discover" className={buttonVariants({ variant: "secondary" })}>Discover people</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
