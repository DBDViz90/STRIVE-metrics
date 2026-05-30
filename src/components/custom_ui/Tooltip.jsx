export const Tooltip = ({ interactionData }) => {
  if (!interactionData) {
    return null;
  }

  const { xPos, yPos, year, metricValue, gdpValue } = interactionData;

  return (
    <div
      className="tooltip"
      style={{
        left: xPos,
        top: yPos,
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 1000,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '11px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        whiteSpace: 'nowrap',
        maxWidth: '140px',
        color: '#333',
      }}
    >
      <div style={{ backgroundColor: '#f0f0f0', padding: '2px 6px' }}>
        {year}
      </div>
      <div style={{ backgroundColor: 'white', padding: '2px 6px' }}>
        {metricValue}
      </div>
      {gdpValue && (
        <div style={{ backgroundColor: 'white', padding: '2px 6px' }}>
          {gdpValue}
        </div>
      )}
    </div>
  );
};
