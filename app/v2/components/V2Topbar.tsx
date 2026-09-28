"use client";

import React from "react";
import { Bell, Menu, Search } from "lucide-react";
import { Profile } from "../lib/types";

interface V2TopbarProps {
  brandName: string;
  profile: Profile;
  onMenuOpen: () => void;
}

const V2Topbar = React.memo(function V2Topbar({ brandName, profile, onMenuOpen }: V2TopbarProps) {
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenuOpen}><Menu size={22} /></button>
      <div className="global-search">
        <Search size={18} />
        <input readOnly value="Database-side search, filter and pagination" />
        <kbd>V2</kbd>
      </div>
      <div className="top-actions">
        <button className="icon-btn"><Bell size={19} /></button>
        <div className="org">
          <span>{brandName}</span>
          <small>Scalable version</small>
        </div>
        <div className="avatar small">{profile.full_name.slice(0, 2).toUpperCase()}</div>
      </div>
    </header>
  );
});

export default V2Topbar;
