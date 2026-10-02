import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="page-nour relative flex min-h-screen items-center justify-center overflow-hidden px-4 text-foreground">
      {/* وهج ذهبي زخرفي خلفي */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl animate-breathe"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-primary/15 blur-3xl animate-breathe"
      />

      <div className="card-nour animate-fade-up relative z-10 w-full max-w-md px-8 py-12 text-center shadow-soft">
        {/* الرقم 404 المتدرّج */}
        <h1 className="text-gradient-gold mb-2 text-8xl font-extrabold leading-none tracking-tight animate-float">
          404
        </h1>

        {/* فاصل ذهبي رقيق */}
        <div
          aria-hidden="true"
          className="mx-auto mb-6 h-px w-24 bg-gradient-to-r from-transparent via-accent to-transparent"
        />

        <p className="mb-2 text-xl font-bold text-foreground">
          الصفحة غير موجودة
        </p>
        <p className="mb-8 text-sm text-muted-foreground">
          عذراً، لم نتمكّن من العثور على ما تبحث عنه.
        </p>

        <Link to="/" className="btn-gold px-6 py-3 shadow-soft">
          العودة إلى الصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
