"use client";

import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { useLocale } from "@/lib/i18n";

/**
 * "Install app" affordance. Renders nothing unless the app is actually installable
 * and not already installed, so it quietly disappears once the user has it.
 *
 * `variant` matches the two nav surfaces it lives in: a row in the desktop rail,
 * a tile in the mobile "More" sheet.
 */
export function InstallAppButton({ variant = "rail" }: { variant?: "rail" | "tile" }) {
  const { canInstall, needsManualInstructions, promptInstall } = useInstallPrompt();
  const { t } = useLocale();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (!canInstall) return null;

  const onClick = () => {
    if (needsManualInstructions) setShowIosHelp(true);
    else void promptInstall();
  };

  const label = t("nav.install");

  return (
    <>
      {variant === "rail" ? (
        <button
          type="button"
          onClick={onClick}
          className="mx-3 flex items-center gap-3 rounded-card px-3 py-2 text-left text-sm font-medium text-primary-700 hover:bg-primary-soft"
        >
          <Download className="size-[18px] shrink-0" strokeWidth={2} />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className="flex flex-col items-center gap-1.5 rounded-card px-2 py-3 text-xs font-medium text-primary-700 hover:bg-primary-soft"
        >
          <Download className="size-5 shrink-0" strokeWidth={2} />
          {label}
        </button>
      )}

      {showIosHelp && <IosInstallSheet onClose={() => setShowIosHelp(false)} />}
    </>
  );
}

/**
 * iOS has no programmatic install prompt, so walk the user through the manual
 * Share > "Add to Home Screen" flow.
 */
function IosInstallSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="ios-install-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-surface pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl sm:inset-0 sm:m-auto sm:h-fit sm:max-w-sm sm:rounded-2xl sm:border">
        <div className="flex items-center justify-between px-4 pt-4">
          <span id="ios-install-title" className="text-sm font-semibold text-ink">
            {t("install.title")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-card p-1 text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <ol className="space-y-3 px-4 py-4 text-sm text-muted">
          <li className="flex items-center gap-3">
            <Share className="size-5 shrink-0 text-primary-600" strokeWidth={2} />
            <span>{t("install.ios.step1")}</span>
          </li>
          <li className="flex items-center gap-3">
            <SquarePlus className="size-5 shrink-0 text-primary-600" strokeWidth={2} />
            <span>{t("install.ios.step2")}</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
