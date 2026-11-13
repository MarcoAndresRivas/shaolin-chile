import { useEffect, useRef, useState } from 'react';
import { nextTab, tabFromHash } from '../../lib/tabs.js';

// Accessible tabs. Only the active tab is rendered, so a panel loads its data
// when it is opened and not before. The selected tab is kept in the URL hash,
// so reloading or sharing the link returns to the same tab.
//
// tabs: [{ id, label, content }]
export default function Tabs({ tabs, label }) {
  const ids = tabs.map((tab) => tab.id);
  const [active, setActive] = useState(ids[0]);
  const buttons = useRef({});

  // The URL decides the first tab, and follows the back and forward buttons.
  useEffect(() => {
    const fromUrl = () => setActive(tabFromHash(window.location.hash, ids, ids[0]));
    fromUrl();
    window.addEventListener('hashchange', fromUrl);
    return () => window.removeEventListener('hashchange', fromUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the tab list does not change

  const select = (id) => {
    setActive(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  const onKeyDown = (event) => {
    const target = nextTab(ids, active, event.key);
    if (!target) return;
    event.preventDefault();
    select(target);
    buttons.current[target]?.focus();
  };

  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[tab.id] = element;
            }}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={tab.id === current.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === current.id ? 0 : -1}
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`panel-${current.id}`} role="tabpanel" aria-labelledby={`tab-${current.id}`} className="tabs__panel portal__grid">
        {current.content}
      </div>
    </div>
  );
}
