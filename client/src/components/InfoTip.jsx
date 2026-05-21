import { useState } from "react";

export default function InfoTip({ title, description, children, position = "top" }) {
  const [visible, setVisible] = useState(false);

  const positionStyles = {
    top:    { bottom: "110%", left: "50%", transform: "translateX(-50%)" },
    bottom: { top: "110%",   left: "50%", transform: "translateX(-50%)" },
    left:   { right: "110%", top: "50%",  transform: "translateY(-50%)" },
    right:  { left: "110%",  top: "50%",  transform: "translateY(-50%)" },
  };

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {/* Always-visible badge */}
      <span style={{
        position: "absolute", top: -4, right: -4,
        width: 13, height: 13, borderRadius: "50%",
        background: "transparent",
        border: "1px solid rgba(255, 114, 0, 0.3)",
        color: "rgba(255, 114, 0, 0.4)", fontSize: 8, fontWeight: 700,
        fontFamily: "serif", display: "flex",
        alignItems: "center", justifyContent: "center",
        pointerEvents: "none", zIndex: 2, lineHeight: 1,
        userSelect: "none",
      }}>ℹ</span>
      {visible && (
        <div style={{
          position: "absolute",
          ...positionStyles[position],
          backgroundColor: "#1a2029",
          color: "#fff",
          padding: description ? "10px 12px" : "6px 10px",
          borderRadius: "8px",
          fontSize: "12px",
          whiteSpace: description ? "normal" : "nowrap",
          minWidth: description ? "180px" : undefined,
          maxWidth: description ? "260px" : undefined,
          zIndex: 9999,
          pointerEvents: "none",
          boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
          border: "1px solid #2a3a4a",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: description ? "7px" : 0,
          }}>
            <span style={{
              color: "#FF7200",
              fontSize: "13px",
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
              fontFamily: "serif",
            }}>ℹ</span>
            <span style={{
              fontWeight: 600,
              fontSize: "12.5px",
              color: "#fff",
              lineHeight: 1.3,
              whiteSpace: "nowrap",
            }}>{title}</span>
          </div>
          {description && (
            <>
              <div style={{ borderTop: "1px solid #2e3a4a", marginBottom: "7px" }} />
              <div style={{ fontSize: "11.5px", color: "#8fa3b8", lineHeight: "1.5" }}>
                {description}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
