"use client";

import { useState } from "react";
import NewDmModal from "@/components/NewDmModal";

export default function DmPageClient({ currentUserId }: { currentUserId: string }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button className="dm-landing-new-btn" onClick={() => setShowModal(true)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        New Message
      </button>
      {showModal && (
        <NewDmModal currentUserId={currentUserId} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
