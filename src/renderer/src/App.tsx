import { RouterProvider } from 'react-router-dom'
import router from './router'
import './assets/main.css'

function App(): React.JSX.Element {
  console.log('App rendered')
  return <RouterProvider router={router} />
}

export default App