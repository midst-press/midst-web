import React, { createElement as e } from 'react'
import uuid from 'uuid/v1'
import appendStyle from './append-style'
import { coords } from './mouse-position'

// ================================================================================
// Constructor
// ================================================================================
class Slider extends React.Component {
    static get defaultProps() {
      return {
        snapToEnd: true,
        controlled: false,
        readOnly: false,
        hideCursor: true,
        stopPropagation: false,
        direction: 'horizontal',
      }
    }

    private css: any
    private el: any
    private id: string

    constructor(props: any) {
      super(props)
  // ================================================================================
  // Initial State
  // ================================================================================
    this.state = {
      value: 0,
    }

  // ================================================================================
  // Bound Methods
  // ================================================================================
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)

  // ================================================================================
  // Styles
  // ================================================================================
      this.css = () => `
        .hem-slider {
          position: relative;
          width: 200px;
          height: 20px;
          border: 1px solid black;
          box-sizing: border-box;
          user-select: none;
        }

        .hem-slider * {
          user-select: none;
        }

        .hem-slider__progress {
          position: absolute;
          left: 0;
          height: 100%;
          background: black;
        }

        .hem-slider__value {
          position: absolute;
          top: 28px;
          width: 100px;
          height: 36px;
          line-height: 18px;
          font-size: 10px;
          background: white;
          border-radius: 5px;
          border: 1px solid #000;
          transform: translate(-58px, -10px);
          text-align: center;
          white-space: pre;
        }

        .left-align-slider-value .hem-slider__value {
          transform: translate(-30px, -10px);
        }

        .horizontal .hem-slider__progress {
          top: 0;
        }

        .vertical .hem-slider__progress {
          top: auto;
          bottom: 0;
        }
      `
  // ================================================================================
  // Class Properties
  // ================================================================================#
      this.el = null
      this.id = uuid()
    }

  // ================================================================================
  // Lifecycle
  // ================================================================================#
    componentDidMount() {
      appendStyle(this.css())

      window.addEventListener('mousemove', this.onMouseMove)
      window.addEventListener('mouseup', this.onMouseUp)
    }

    componentWillUnmount() {
      window.removeEventListener('mousemove', this.onMouseMove)
      window.removeEventListener('mouseup', this.onMouseUp)
    }

  // ================================================================================
  // Handlers
  // ================================================================================
    onMouseDown(evt: any) {
      const { direction, hideCursor, onDragStart, onMouseDown, onChange, readOnly, stopPropagation } = this.props as any
      if (readOnly) return

      if (stopPropagation) {
        evt.stopPropagation()
      }

      (window as any).dragging = this.id

      if (hideCursor) {
        document.body.style.cursor = 'none'
      }

      let value

      if (direction === 'vertical') {
        value = coords(evt, this.el).y
      }

      else {
        value = coords(evt, this.el).x
      }

      this.setState({value}, () => {
        if (onChange) {
          onChange((this.state as any).value)
        }
      })

      if (onDragStart) {
        onDragStart()
      }

      if (onMouseDown) {
        onMouseDown()
      }
    }

    onMouseMove(evt: any) {
      if ((window as any).dragging !== this.id) return

      evt.stopPropagation()

      const { onChange, readOnly, direction } = this.props as any

      if (readOnly) return

      let value

      if (direction === 'vertical') {
        value = coords(evt, this.el).y
      }

      else {
        value = coords(evt, this.el).x
      }

      this.setState({ value }, () => {
        if (onChange) {
          onChange((this.state as any).value)
        }
      })
    }

    onMouseUp(evt: any) {
      if ((window as any).dragging !== this.id) return

      evt.stopPropagation()

      const { hideCursor, onDragEnd } = this.props as any

      (window as any).dragging = undefined

      if (hideCursor) {
        document.body.style.cursor = 'auto'
      }
      if (onDragEnd) {
        onDragEnd()
      }
    }

  // ================================================================================
  // Other Methods
  // ================================================================================
  // N/A

  // ================================================================================
  // Render
  // ================================================================================
    render() {
      const { direction, value: propsValue, propsDisplayValue, controlled, showDisplayValue } = this.props as any
      const { value: stateValue } = this.state as any
      const value = controlled ? propsValue : stateValue
      const displayValue = controlled ? propsDisplayValue : stateValue

      let style
      let valueStyle

      if (direction === 'vertical') {
        style = {
          height: `${value * 100}%`
        }

        valueStyle = {
          bottom: `${value * 100}%`
        }
      }

      else {
        style = {
          width: `${value * 100}%`
        }

        valueStyle = {
          left: `${value * 100}%`
        }
      }

      return (
        e('div', {
          className: 'hem-slider ' + direction,
          onMouseDown: this.onMouseDown,
          onMouseUp: this.onMouseUp,
          ref: el => this.el = el
        },
          e('div', {
            className: 'hem-slider__progress',
            style,
          }),
          showDisplayValue && displayValue && e('div', {
            className: 'hem-slider__value',
            style: valueStyle,
          }, displayValue)
        )
      )
    }
  }

  export default Slider
