import ReactDOM from 'react-dom'
import Root from './components/Root'
import './index.css'
import { installFonts } from './fonts'
import { POEM_LIST } from './config'
import store from './store'
import { loadPoemList } from './store/actions'

installFonts()
if (POEM_LIST === 'published') store.dispatch(loadPoemList())
ReactDOM.render(Root, document.getElementById('root'))
