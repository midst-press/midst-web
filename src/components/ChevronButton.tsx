import React, { ReactElement, PropsWithChildren } from 'react'

interface IProps {
  className?: string
  onClick?: () => void
}

const styleSheet = `
  .hem-chevron-button {
    position: relative;
    width: 30px;
    height: 100px;
    background: rgba(0, 0, 0, .5);
    cursor: pointer;
  }

  .hem-chevron-button .hem-chevron-button-icon {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: scale(.8) translateX(8px) translateY(3px);
  }

  .hem-chevron-button .hem-chevron-button-icon::after,
  .hem-chevron-button .hem-chevron-button-icon::before {
    display: block;
    content: " ";
    position: absolute;
    top: 0;
    left: 0;
    width: 2px;
    height: 50%;
    background: #fff;
    transform: rotate(-20deg);
    transform-origin: top left;
    opacity: .5;
    transition: opacity 300ms;
  }

  .hem-chevron-button:hover .hem-chevron-button-icon::after,
  .hem-chevron-button:hover .hem-chevron-button-icon::before {
    opacity: 1;
  }

  .hem-chevron-button .hem-chevron-button-icon::before {
    transform: rotate(20deg);
    top: 46px;
    left: 17px;
  }
`

function ChevronButton({ className, onClick }: PropsWithChildren<IProps>): ReactElement {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styleSheet }} />
      <div
        className={`hem-chevron-button ${className}`}
        onClick={onClick}
      >
        <div className="hem-chevron-button-icon" />
      </div>
    </>
  )
}

export default ChevronButton
