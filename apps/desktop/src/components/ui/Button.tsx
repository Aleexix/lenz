import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost";
};

const variants = {
  primary: "bg-electric-600 text-white hover:bg-electric-400",
  ghost: "border border-navy-800 text-ice/80 hover:bg-navy-800 hover:text-ice",
};

/** Botón base. Se reemplaza por el de shadcn/ui cuando se integre. */
export function Button({ variant = "primary", className = "", type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
