"use client";

import { useEffect } from "react";

export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    (document.getElementById(formId) as HTMLFormElement | null)?.submit();
  }, [formId]);
  return null;
}
