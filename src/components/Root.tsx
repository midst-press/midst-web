import React from 'react'
import { Provider } from 'react-redux'
import store from '../store'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

const Root = (
  <Provider store={store}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </Provider>
)

export default Root
