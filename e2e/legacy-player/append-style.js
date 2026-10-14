const appendStyle = css => {
  const style = document.createElement('style')
  style.innerText = css
  document.head.appendChild(style)
}

module.exports = appendStyle
