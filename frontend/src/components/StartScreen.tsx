"use client";

import { useState } from "react";

interface Preset {
  id: string;
  name: string;
  icon: string;
  color: string;
  prompt: string;
}

interface StartScreenProps {
  presets: Preset[];
  onPresetClick: (preset: Preset) => void;
}

export default function StartScreen({ presets, onPresetClick }: StartScreenProps) {
  const [model, setModel] = useState("gemini-2.5-flash");
  const [saveToCloud, setSaveToCloud] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = presets.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="start-screen">
      <h1 className="start-title">Start Conversation</h1>

      {/* Controls */}
      <div className="start-controls">
        <select className="model-select" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="gemini-2.5-flash">Model gemini-2.5-flash</option>
          <option value="gpt-4">Model gpt-4</option>
        </select>

        <div className="toggle-group">
          <div className={`toggle ${saveToCloud ? "active" : ""}`} onClick={() => setSaveToCloud(!saveToCloud)}>
            <div className="toggle-knob" />
          </div>
          Save to cloud?
        </div>
      </div>

      {/* Search */}
      <div className="search-instruction">
        <input
          type="text"
          placeholder="Search Character Instruction..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Preset Cards */}
      <div className="presets-grid">
        {/* Add New Card */}
        <button className="preset-card preset-add" onClick={() => onPresetClick({ id: "custom", name: "New Chat", icon: "+", color: "#334155", prompt: "" })}>
          <div className="preset-icon" style={{ fontSize: 28 }}>+</div>
          <div className="preset-name">Add New &amp; Update</div>
        </button>

        {filtered.map((preset) => (
          <button
            key={preset.id}
            className="preset-card"
            style={{ background: preset.color }}
            onClick={() => onPresetClick(preset)}
          >
            <div className="preset-icon">{preset.icon}</div>
            <div className="preset-name">{preset.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
