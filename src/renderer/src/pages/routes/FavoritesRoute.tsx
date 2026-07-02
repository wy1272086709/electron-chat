import React, { useEffect } from 'react'
import Favorites from '@renderer/components/favorites/Favorites'
import { useLayoutContext } from '@renderer/context/LayoutContext'

const FavoritesRoute: React.FC = () => {
  const { activePanel, setActivePanelState, favorites } = useLayoutContext()

  useEffect(() => {
    if (activePanel !== 'favorites') {
      setActivePanelState('favorites')
    }
  }, [activePanel, setActivePanelState])

  return (
    <div className="right-panel active">
      <Favorites favorites={favorites} />
    </div>
  )
}

export default FavoritesRoute
