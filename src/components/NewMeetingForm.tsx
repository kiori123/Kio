"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewMeetingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);

    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_name: form.get("brand_name"),
        title: form.get("title"),
        language: form.get("language"),
        prep_notes: form.get("prep_notes"),
      }),
    });

    setBusy(false);
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Could not create the meeting.");
    router.push(`/meeting/${json.meeting.id}`);
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <div>
        <label className="label" htmlFor="brand_name">
          Brand
        </label>
        <input id="brand_name" name="brand_name" required className="input" placeholder="Acme Skincare" />
      </div>
      <div>
        <label className="label" htmlFor="title">
          Meeting title
        </label>
        <input id="title" name="title" className="input" placeholder="Discovery call" />
      </div>
      <div>
        <label className="label" htmlFor="language">
          Suggestion language
        </label>
        <select id="language" name="language" className="input" defaultValue="auto">
          <option value="auto">Match the room</option>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="prep_notes">
          What we already know
        </label>
        <textarea
          id="prep_notes"
          name="prep_notes"
          rows={4}
          className="input"
          placeholder="Anything from research or prior emails. The copilot will not re-ask what you paste here."
        />
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? "Creating…" : "Start meeting"}
      </button>
      {error && <p className="text-xs text-gap">{error}</p>}
    </form>
  );
}
