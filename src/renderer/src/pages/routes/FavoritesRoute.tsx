import React, { useEffect } from 'react'
import Favorites from '@renderer/components/favorites/Favorites'
import { useNavigationContext } from '@renderer/context/LayoutContext'

const FavoritesRoute: React.FC = () => {
  const { activePanel, setActivePanelState } = useNavigationContext()

  useEffect(() => {
    if (activePanel !== 'favorites') {
      setActivePanelState('favorites')
    }
  }, [activePanel, setActivePanelState])

  return (
    <div className="right-panel active">
      <Favorites />
    </div>
  )
}

export default FavoritesRoute
