import ReactDOM from 'react-dom'
import Root from './components/Root'
import './index.css'
import { installFonts } from './fonts'

installFonts()
ReactDOM.render(Root, document.getElementById('root'))
