import React, { createContext, useContext, useState, useCallback } from 'react';

const EventContext = createContext();

export const EventProvider = ({ children }) => {
  const [highlightedTree, setHighlightedTree] = useState(null);
  const [visibleTrees, setVisibleTrees] = useState([]);

  const handleFeatureClick = useCallback((e) => {
    const feature = e.features[0];
    // Handle feature click logic, possibly interacting with PopupHandler
  }, []);

  const handleFeatureHover = useCallback((e) => {
    e.target.getCanvas().style.cursor = 'pointer';
    // Additional hover logic if needed
  }, []);

  return (
    <EventContext.Provider value={{
      highlightedTree,
      setHighlightedTree,
      visibleTrees,
      setVisibleTrees,
      handleFeatureClick,
      handleFeatureHover,
    }}>
      {children}
    </EventContext.Provider>
  );
};

export const useEventContext = () => useContext(EventContext);
