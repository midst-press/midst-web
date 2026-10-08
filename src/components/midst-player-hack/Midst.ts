import React, { createElement as e } from 'react'
import $ from 'jquery'
import moment from 'moment'
import Scrollbars from 'react-scrollbars-custom'
import { isEmpty, get, last } from 'lodash'
import Slider from './Slider'
import Drop from './Drop'
import iconCheckSquare from './icon-check-square'
import iconCloseX from './icon-close-x'
import iconDrawer from './icon-drawer'
import iconEdit from './icon-edit'
import iconMarker from './icon-marker'
import iconMessageCircle from './icon-message-circle'
import iconPlay from './icon-play'
import iconSquare from './icon-square'
import iconTimeline from './icon-timeline'
import iconTrash from './icon-trash'
import { IMidstFile } from '../../store/types'
import {
  end,
  pause,
  play,
  speedometerHi,
  speedometerLow,
  speedometerMed,
} from './base64icons'
import './style.css'

const LOG_AUTO_SCROLL = false

function autoScrollLog(...args: any[]) {
  if (!LOG_AUTO_SCROLL) return
  console.log(...args)
}

function getUrlVars() {
  var vars: any = {}
  window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
    vars[key] = value
    return ''
  })
  return vars
}

interface IProps {
  activePlayer: boolean
  appCursorFollowing: boolean
  hasScrollbar: boolean
  isPlayer: boolean
  MIDST_DATA_URL?: string
  MIDST_DATA_JS?: IMidstFile
  MIDST_DATA_JS_KEY?: string
}

// ================================================================================
// Constructor
// ================================================================================
class Midst extends React.Component<IProps, any> {
  static get defaultProps() {
    return {
      isPlayer: false,
    }
  }

  private editorFontSizes = [10, 12, 14, 24, 36]
  private defaultFontSize = 14
  private FILE_EXT = '.midst'
  private initialState = {} as any
  private el: any
  private $editable: any
  private $scrollable: any
  private editorNumLines: any
  private autoScrubTimeout: any
  private scrollIntoViewTimeout: any
  private isAutoScrolling: boolean = false
  private isAutoScrollingOnce: boolean = false
  private preAutoScrollTimeout: any
  //@ts-ignore
  private scrollerInstance: Scrollbars

  constructor(props: any) {
    super(props)

// ================================================================================
// Class Properties
// ================================================================================#

// ================================================================================
// Initial State
// ================================================================================
    this.initialState = {
      appAboutOpen: false,
      appCursorFollowing: true,
      appDrawerOpen: false,
      appFileAbsPath: false,
      appFocusMode: false,
      appTimelineMode: false,
      appTitle: 'Untitled',
      editorAuthor: 'Anonymous',
      editorCachedSelection: [],
      editorCreatingDraftMarker: false,
      editorDraftMarkers: [],
      editorFontFamily: 'Helvetica',
      editorFontSize: this.defaultFontSize,
      editorFormatBold: false,
      editorFormatItalic: false,
      editorHasUnsavedChanges: false,
      editorHighestEverDraftNumber: 0,
      editorNumLines: 0,
      editorPlaying: false,
      editorShowDraftMarkers: true,
      editorShowDraftMarkerLabels: true,
      editorTimelineFrames: [],
      editorTimelineIndex: 0,
      editorTitle: 'Untitled',
      playerPlaybackSpeed: 'med',
      playerPlaybackSpeedDropOpen: false,
      onKeydownSet: false,
    }

    this.state = JSON.parse(JSON.stringify(this.initialState))

// ================================================================================
// Bound Methods
// ================================================================================
    this.appOnKeyDown = this.appOnKeyDown.bind(this)
    this.createDraftMarker = this.createDraftMarker.bind(this)
    this.editorOnBlur = this.editorOnBlur.bind(this)
    this.editorOnInput = this.editorOnInput.bind(this)
    this.editorOnKeyDown = this.editorOnKeyDown.bind(this)
    this.editorOnMouseDown = this.editorOnMouseDown.bind(this)
    this.editorOnPaste = this.editorOnPaste.bind(this)
    this.exitTimelineMode = this.exitTimelineMode.bind(this)
    this.fontSizeDefault = this.fontSizeDefault.bind(this)
    this.fontSizeDown = this.fontSizeDown.bind(this)
    this.fontSizeUp = this.fontSizeUp.bind(this)
    this.newFile = this.newFile.bind(this)
    this.openFile = this.openFile.bind(this)
    this.pause = this.pause.bind(this)
    this.play = this.play.bind(this)
    this.quit = this.quit.bind(this)
    this.saveFile = this.saveFile.bind(this)
    this.saveFileAs = this.saveFileAs.bind(this)
    this.setFontFamily = this.setFontFamily.bind(this)
    this.setFontSize = this.setFontSize.bind(this)
    this.sliderOnChange = this.sliderOnChange.bind(this)
    this.toggleDrawer = this.toggleDrawer.bind(this)
    this.toggleFocusMode = this.toggleFocusMode.bind(this)
    this.toggleFontFormatBold = this.toggleFontFormatBold.bind(this)
    this.toggleFontFormatItalic = this.toggleFontFormatItalic.bind(this)
    this.toggleTimeline = this.toggleTimeline.bind(this)

    this.doneScrollingIntoView = this.doneScrollingIntoView.bind(this)

// ================================================================================
// Styles
// ================================================================================
// N/A
  }

// ================================================================================
// Lifecycle
// ================================================================================#
  componentDidMount() {
    const { isPlayer, MIDST_DATA_URL, MIDST_DATA_JS, appCursorFollowing, hasScrollbar } = this.props

    this.$editable = $(this.el).find('.editable')
    this.$scrollable = $(this.el).find('.ScrollbarsCustom-Scroller')

    this.$scrollable[0].addEventListener('scroll', () => autoScrollLog('scrolled somehow'))

    // Force first line of contenteditable to be wrapped in a <p>.
    this.$editable.html('<p><br></p>')

    this.setState({
      appCursorFollowing,
      hasScrollbar,
    })

    if (isPlayer && !isEmpty(MIDST_DATA_URL)) {
      $.ajax({
        url: MIDST_DATA_URL,
        success: (res: any) => {
          this.load({
            data: JSON.parse(res),
          })
        }
      })
    }

    else if (isPlayer && !isEmpty(MIDST_DATA_JS)) {
      $('body').on('keydown', (evt) => {
        if (evt.keyCode === 32) {
          if (this.state.editorPlaying) {
            this.pause()
          }

          else {
            this.play()
          }
        }
      })

      this.load({
        data: MIDST_DATA_JS,
      })
    }

    else {
      $('body').on('keydown', this.appOnKeyDown)

      this.$editable.on('blur', this.editorOnBlur)
      this.$editable.on('input', this.editorOnInput)
      this.$editable.on('keydown', this.editorOnKeyDown)
      this.$editable.on('keyup', this.editorOnKeyUp)
      this.$editable.on('mousedown', this.editorOnMouseDown)
      this.$editable.on('paste', this.editorOnPaste)
    }

    // if (typeof ipc !== 'undefined') {
    //   ipc.on('menu.about', () => this.setState({ appAboutOpen: true }))
    //   ipc.on('menu.cursorFollowingOff', () => this.setState({ cursorFollowing: false }))
    //   ipc.on('menu.cursorFollowingOn', () => this.setState({ cursorFollowing: true }))
    //   ipc.on('menu.fontSizeDefault', this.fontSizeDefault)
    //   ipc.on('menu.fontSizeDown', this.fontSizeDown)
    //   ipc.on('menu.fontSizeUp', this.fontSizeUp)
    //   ipc.on('menu.newFile', this.newFile)
    //   ipc.on('menu.openFile', this.openFile)
    //   ipc.on('menu.quit', this.quit)
    //   ipc.on('menu.saveFile', this.saveFile)
    //   ipc.on('menu.saveFileAs', this.saveFileAs)
    //   ipc.on('menu.setFontFamily', this.setFontFamily)
    //   ipc.on('menu.setFontSize', this.setFontSize)
    //   ipc.on('menu.toggleFocusMode', this.toggleFocusMode)
    //   ipc.on('menu.toggleFontFormatBold', this.toggleFontFormatBold)
    //   ipc.on('menu.toggleFontFormatItalic', this.toggleFontFormatItalic)

    //   ipc.on('fileOpened', (evt, fileData) => this.load(fileData))
    // }
  }

  componentDidUpdate(prevProps: IProps) {
    const { isPlayer, MIDST_DATA_JS, MIDST_DATA_JS_KEY, activePlayer } = this.props

    if (!activePlayer && prevProps.activePlayer) {
      this.pause()
      clearTimeout(this.autoScrubTimeout)
      this.setPos(this.state.editorTimelineFrames.length - 1, false)

      setTimeout(() => {
        this.$scrollable[0].scrollTop = 0
      }, 1)
    }

    if (
      isPlayer
      && !isEmpty(MIDST_DATA_JS)
      && MIDST_DATA_JS_KEY !== prevProps.MIDST_DATA_JS_KEY
    ) {
      this.load({
        data: MIDST_DATA_JS,
      })

      if (!this.state.onKeydownSet) {
        $('body').on('keydown', (evt) => {
          if (evt.keyCode === 32) {
            if (!this.props.activePlayer) return

            if (this.state.editorPlaying) {
              this.pause()
            }

            else {
              this.play()
            }
          }
        })

        this.setState({onKeydownSet: true})
      }
    }
  }

  componentWillUnmount() {
    if (!this.props.isPlayer) {
      this.$editable.off('blur')
      this.$editable.off('input')
      this.$editable.off('keydown')
      this.$editable.off('keyup')
      this.$editable.off('mousedown')
      this.$editable.off('paste')
      $('body').off('keydown')
    }
  }

// ================================================================================
// Models
// ================================================================================
  modelDraftMarker({ description, name, timelineIndex, timestamp }: any) {
    const defaultName = 'Draft ' + (this.state.editorHighestEverDraftNumber + 1)

    return {
      description,
      defaultName,
      name,
      timelineIndex,
      timestamp,
    }
  }

  modelTimelineFrame({ content, lineNumber, timestamp }: any) {
    return {
      content,
      lineNumber,
      timestamp,
    }
  }

  modelMidstFile() {
    const { editorTimelineFrames, editorDraftMarkers, editorHighestEverDraftNumber, editorAuthor, editorTitle, editorFontFamily, editorFontSize } = this.state

    return  {
      editorTimelineFrames,
      meta: {
        editorDraftMarkers,
        editorHighestEverDraftNumber,
        editorAuthor,
        editorTitle,
        editorFontFamily,
        editorFontSize,
      }
    }
  }

// ================================================================================
// Handlers
// ================================================================================
  appOnKeyDown(evt: any) {
    const { isPlayer } = this.props
    const { appTimelineMode, editorTimelineIndex, appFocusMode, editorTimelineFrames } = this.state

    if (evt.keyCode === 27) {
      this.setState({ appAboutOpen: false })

      if (appFocusMode) {
        this.setState({ appFocusMode: false })
      }

      else {
        this.exitTimelineMode()
      }
    }

    if (appTimelineMode || isPlayer) {
      if (evt.keyCode === 37 && editorTimelineIndex > 0) {
        if (evt.shiftKey && editorTimelineIndex > 9) {
          this.setPos(editorTimelineIndex - 10)
        }

        else {
          this.setPos(editorTimelineIndex - 1)
        }
      }

      else if (evt.keyCode === 39 && editorTimelineIndex < editorTimelineFrames.length) {
        if (evt.shiftKey && editorTimelineIndex < editorTimelineFrames.length - 11) {
          this.setPos(editorTimelineIndex + 10)
        }

        else {
          this.setPos(editorTimelineIndex + 1)
        }

        if (editorTimelineIndex / this.state.editorTimelineFrames.length > .98) {
          this.setPos(this.state.editorTimelineFrames.length - 1)
          this.scrollerInstance.scrollToTop()
        }
      }
    }
  }

  editorOnKeyUp(evt: any) {
    if (evt.keyCode === 13) {
      // Use <p>'s instead of <div>'s.
      document.execCommand('formatBlock', false, 'p')
    }
  }

  editorOnInput() {
    this.reflowLineNumbers()
    this.captureTimelineFrame(this.$editable.html())
    this.exitTimelineMode()
    this.detectFormatting()
  }

  editorOnBlur() {
    // saveSelection()
    // setTimeout(() => {
    //   // restoreSelection()
    // }, 1)
  }

  editorOnPaste(evt: any) {
    evt.preventDefault()

    if (evt.originalEvent.clipboardData) {
      const htmlContent = evt.originalEvent.clipboardData.getData('text/html')
      const textContent = evt.originalEvent.clipboardData.getData('text/plain')
      const contentIsHtml = htmlContent.length
      let content = contentIsHtml ? htmlContent : textContent

      if (contentIsHtml) {
        if (content.includes('<body>')) {
          content = content.split('<body>')[1].split('</body>')[0]
        }

        const o = 'HTML_OPEN_TAG'
        const c = 'HTML_CLOSE_TAG'

        content = content.replace(/<br[ a-zA-Z0-9="':;,\-\(\)]* \/>/g, ':::MIDST_LINE_BREAK_TOKEN:::')
        content = content.replace(/<br[ a-zA-Z0-9="':;,\-\(\)]*>/g, ':::MIDST_LINE_BREAK_TOKEN:::')

        content = content.replace(/<p[ a-zA-Z0-9="':;,\-\(\)]*>/g, o + 'p' + c)
        content = content.replace(/<\/p>/g, o + '/p' + c)
        content = content.replace(/<b[ a-zA-Z0-9="':;,\-\(\)]*>/g, o + 'b' + c)
        content = content.replace(/<\/b>/g, o + '/b' + c)
        content = content.replace(/<i[ a-zA-Z0-9="':;,\-\(\)]*>/g, o + 'i' + c)
        content = content.replace(/<\/i>/g, o + '/i' + c)
        content = content.replace(/(<([^>]+)>)/ig, '')

        content = content.replace(/HTML_OPEN_TAG/g, '<')
        content = content.replace(/HTML_CLOSE_TAG/g, '>')

        content = content.replace(/:::MIDST_LINE_BREAK_TOKEN:::/g, '<br>')
      }

      document.execCommand('insertHtml', false, content)
    }

    setTimeout(() => {
      this.detectFormatting()
    }, 1)
  }

  editorOnKeyDown(evt: any) {
    const { editorFormatBold, editorFormatItalic } = this.state

    this.detectFormatting()

    if (evt.keyCode === 9) {
      evt.preventDefault()
      document.execCommand('insertText', false, '\t')
    }

    if (evt.metaKey) {
      if (evt.keyCode === 66) {
        this.setState({ editorFormatBold: !editorFormatBold })
      }

      if (evt.keyCode === 73) {
        this.setState({ editorFormatItalic: !editorFormatItalic })
      }
    }
  }

  editorOnMouseDown(evt: any) {
    this.detectFormatting(evt)
  }

  toggleTimeline() {
    this.setState({
      appTimelineMode: !this.state.appTimelineMode,
    }, () => {
      if (!this.state.appTimelineMode && this.state.appDrawerOpen) {
        this.setState({
          appDrawerOpen: false,
        })
      }

      if (!this.state.appTimelineMode) {
        setTimeout(() => {
          this.focusEditableAtEnd()
        }, 1)
      }
    })
  }

  toggleDrawer() {
    this.setState({
      appDrawerOpen: !this.state.appDrawerOpen,
    }, () => {
      // if (this.state.appDrawerOpen) {
      //   this.setState({
      //     appTimelineMode: true,
      //   })
      // }

      // else {
      //   this.setState({
      //     appTimelineMode: false,
      //   })
      // }
    })
  }

  toggleFocusMode() {
    this.setState({ appFocusMode: !this.state.appFocusMode })
  }

  enterTimelineMode() {
    this.setState({ appTimelineMode: true })
  }

  exitTimelineMode(refocus?: boolean) {
    this.setState({
      appTimelineMode: false,
      appDrawerOpen: false,
      editorCreatingDraftMarker: false,
    }, () => {
      refocus && setTimeout(() => {
        this.focusEditableAtEnd()
      }, 1)
    })
  }

  fontSizeDown() {
    const { editorFontSize } = this.state
    const index = this.editorFontSizes.indexOf(editorFontSize)

    if (index > 0) {
      this.setState({
        editorFontSize: this.editorFontSizes[index - 1],
        editorHasUnsavedChanges: true,
      })
    }
  }

  fontSizeUp() {
    const { editorFontSize } = this.state
    const index = this.editorFontSizes.indexOf(editorFontSize)
    if (index > -1 && index < this.editorFontSizes.length - 1) {
      this.setState({
        editorFontSize: this.editorFontSizes[index + 1],
        editorHasUnsavedChanges: true,
      })
    }
  }

  fontSizeDefault() {
    this.setState({
      editorFontSize: this.defaultFontSize,
      editorHasUnsavedChanges: true,
    })
  }

  setFontFamily(evt: any, data: any) {
    this.setState({
      editorFontFamily: data,
      editorHasUnsavedChanges: true,
    })
  }

  setFontSize(evt: any, data: any) {
    this.setState({
      editorFontSize: data,
      editorHasUnsavedChanges: true,
    })
  }

  toggleFontFormatBold() {
    document.execCommand('bold')
    this.setState({ editorFormatBold: !this.state.editorFormatBold })
  }

  toggleFontFormatItalic() {
    document.execCommand('italic')
    this.setState({ editorFormatItalic: !this.state.editorFormatItalic })
  }

  sliderOnChange(val: any) {
    const index = Math.ceil(this.state.editorTimelineFrames.length * val)

    if (index / this.state.editorTimelineFrames.length > .98) {
      this.setPos(this.state.editorTimelineFrames.length - 1)
      this.scrollerInstance.scrollToTop()
    }

    else {
      this.setPos(index)
    }
  }

// ================================================================================
// Other Methods
// ================================================================================
  hasBoldFormatting($el: any) {
    return (
      $el.prop('tagName') === 'B'
        || $el.parents('b').length
        || $el.children('b').length
    )
  }

  hasItalicFormatting($el: any) {
    return (
      $el.prop('tagName') === 'I'
        || $el.parents('i').length
        || $el.children('i').length
    )
  }

  detectFormatting(evt?: any) {
    setTimeout(() => {
      this.setState({
        editorFormatBold: document.queryCommandState('bold'),
        editorFormatItalic: document.queryCommandState('italic'),
      })
    })

    // if (this.$editable.text().length < 2) return

    // if (evt) {
    //   const $target = $(evt.target)
    //   const $subject = $target.prop('tagName') === 'P'
    //     ? $target.children().last()
    //     : $target

    //   this.setState({
    //     editorFormatBold: this.hasBoldFormatting($subject),
    //     editorFormatItalic: this.hasItalicFormatting($subject),
    //   })
    // }

    // else {
    //   const $subject = $(window.getSelection().anchorNode)
    //   const $lineElement = $(window.getSelection().anchorNode).parents('p')
    //   const lineElementText = $lineElement.text()
    //   const hasFormatting = this.hasBoldFormatting($subject) || this.hasItalicFormatting($subject)

    //   if (hasFormatting) {
    //     this.setState({
    //       editorFormatBold: this.hasBoldFormatting($subject),
    //       editorFormatItalic: this.hasItalicFormatting($subject),
    //     })
    //   }

    //   else if (lineElementText && lineElementText.length) {
    //     this.setState({
    //       editorFormatBold: false,
    //       editorFormatBold: false
    //     })
    //   }
    // }
  }

  reflowLineNumbers(force?: any) {
    const $lines = this.$editable.find('p')

    if (force || (this.editorNumLines !== $lines.length)) {
      $lines.each(function(i: any) {
        // $(this).attr('data-line-number', i)
      })
      this.editorNumLines = $lines.length
    }
  }

  captureTimelineFrame(content: any) {
    // const { editorTimelineFrames } = this.state
    // const $emptyLine = $(window.getSelection().anchorNode)
    // const $emptyLineRoot = $emptyLine.parents('p')
    // const $line = $emptyLineRoot.length ? $emptyLineRoot : $emptyLine
    // const lineNumber = $line.attr('data-line-number')

    // const nextFrame = this.modelTimelineFrame({
    //   content,
    //   lineNumber,
    //   timestamp: + new Date(),
    // })

    // this.setState({
    //   appTimelineMode: false,
    //   editorTimelineIndex: editorTimelineFrames.length,
    //   editorTimelineFrames: editorTimelineFrames.concat([nextFrame]),
    //   editorHasUnsavedChanges: true,
    // })
  }

  setPos(index: any, scrollCursorIntoView: boolean = true, once: boolean = true) {
    this.setState({ editorTimelineIndex: index }, () => {
      index = Math.ceil(index)
      if (this.state.editorTimelineFrames[index]) {
        this.$editable.html(this.state.editorTimelineFrames[index].content)
      }

      if (scrollCursorIntoView) {
        this.isAutoScrollingOnce = once
        setTimeout(() => {
          this.scrollCursorIntoView()
        }, 1)
      }
    })
  }

  play() {
    autoScrollLog('play')
    if (this.state.editorTimelineIndex >= this.state.editorTimelineFrames.length - 1) {
      this.setPos(0, true, false)
    }

    this.setState({ editorPlaying: true }, this.autoScrub)
  }

  pause() {
    this.setState({ editorPlaying: false })
  }

  autoScrub() {
    const { editorPlaying, playerPlaybackSpeed, editorTimelineIndex, editorTimelineFrames } = this.state
    autoScrollLog('autoscrub')

    clearTimeout(this.autoScrubTimeout)

    if (editorPlaying === false || this.isAutoScrolling) return

    autoScrollLog('can autoscrub')

    if (editorTimelineIndex === undefined || editorTimelineIndex >= editorTimelineFrames.length) {
      autoScrollLog('end of timeline')
      clearTimeout(this.autoScrubTimeout)
      this.setState({ editorPlaying: false })
      this.scrollerInstance.scrollToTop()
      return
    }

    autoScrollLog('continue playing ' + editorTimelineIndex + ' ' + editorTimelineFrames.length)

    let time: number = 73 // Default, 'med'

    if (playerPlaybackSpeed === 'low') {
      time = 135
    }

    else if (playerPlaybackSpeed === 'hi') {
      time = 40
    }

    this.autoScrubTimeout = setTimeout(() => {
      this.setPos(editorTimelineIndex + 1, true, false)
      this.autoScrub()
    }, time)
  }

  async checkForUnsavedChanges(message: any) {
    // if (this.state.editorHasUnsavedChanges) {
    //   const res = await remote.getGlobal('confirm')(
    //     message || 'The current document contains unsaved changes. Proceed anyway?',
    //     ['Ok', 'Cancel'],
    //   )

    //   if (res === 1) return false
    // }

    // return true
  }

  async newFile() {
    // if (!await this.checkForUnsavedChanges()) return
    // this.setState(this.initialState)
    // this.$editable.html('<p><br></p>')
  }

  async openFile() {
    // if (!await this.checkForUnsavedChanges()) return
    // remote.getGlobal('openFile')()
  }

  async saveFile () {
    const { appFileAbsPath, editorHasUnsavedChanges } = this.state

    if (!editorHasUnsavedChanges) return

    if (!appFileAbsPath) {
      this.saveFileAs()
    }

    else {
      // remote.getGlobal('saveFile')(appFileAbsPath, this.modelMidstFile())
      this.setState({ editorHasUnsavedChanges: false })
    }
  }

  async saveFileAs () {
    // const fileInfo = await remote.getGlobal('saveFileAs')(this.modelMidstFile())

    // if (!fileInfo) return

    // this.setState({
    //   appFileAbsPath: fileInfo.fileAbsPath,
    //   appTitle: fileInfo.fileName.replace(new RegExp(`${this.FILE_EXT}$`), ''),
    //   editorHasUnsavedChanges: false
    // })
  }

  load(fileData: any) {
    this.setState({
      appTitle: fileData.fileName ? fileData.fileName.replace(this.FILE_EXT, '') : 'Untitled',
      editorTimelineIndex: fileData.data.editorTimelineFrames.length,
      editorTimelineFrames: fileData.data.editorTimelineFrames,
      editorAuthor: fileData.data.meta.author,
      editorTitle: fileData.data.meta.editorTitle,
      editorDraftMarkers: fileData.data.meta.editorDraftMarkers,
      editorHighestEverDraftNumber: fileData.data.meta.editorHighestEverDraftNumber || 0,
      editorHasUnsavedChanges: false,
      appFileAbsPath: fileData.path,
      editorFontFamily: fileData.data.meta.editorFontFamily || 'Helvetica',
      editorFontSize: fileData.data.meta.editorFontSize || this.defaultFontSize,
    }, () => {
      this.$editable.html(get(last(this.state.editorTimelineFrames), 'content'))
      this.$editable.focus()
    })
  }

  async quit() {
    // if (!await this.checkForUnsavedChanges()) return
    // remote.getGlobal('setOkToCloseWindow')(true)
    // remote.getGlobal('quit')()
  }

  createDraftMarker() {
    const { editorDraftMarkers, editorTimelineIndex, appTimelineMode, editorHighestEverDraftNumber, editorShowDraftMarkerLabels } = this.state

    this.setState({
      editorHasUnsavedChanges: true,
      editorCreatingDraftMarker: editorShowDraftMarkerLabels,
      editorHighestEverDraftNumber: editorHighestEverDraftNumber + 1,
      editorDraftMarkers: editorDraftMarkers.concat([this.modelDraftMarker({ timelineIndex: editorTimelineIndex })]),
    }, () => {
      if (editorShowDraftMarkerLabels) {
        // this.editDraftMarkerLabel(editorTimelineIndex)()
      }
    })

    if (!appTimelineMode) {
      this.enterTimelineMode()
    }
  }

  editDraftMarkerLabel(timelineIndex: any, inDrawer: any) {
    // return () => {
    //   const id = 'draft-marker-' + timelineIndex + (inDrawer ? '-in-drawer' : '')
    //   const marker = find(this.state.editorDraftMarkers, { timelineIndex })

    //   this.setState({ editorEditingDraftMarker: timelineIndex + (inDrawer ? '-drawer' : '') })

    //   setTimeout(() => {
    //     const $input = $('#' + id)

    //     $input.attr('value', marker.name || marker.defaultName)
    //     $input.focus()
    //     $input.select()

    //     $input.on('blur', () => {
    //       this.saveDraftMarkerLabel(timelineIndex, inDrawer)
    //     })
    //   }, 100)
    // }
  }

  saveDraftMarkerLabel(timelineIndex: any, inDrawer: any) {
    const { editorDraftMarkers } = this.state
    const id = 'draft-marker-' + timelineIndex + (inDrawer ? '-in-drawer' : '')
    // const inputValue = document.getElementById(id).value
    // const marker = _.find(editorDraftMarkers, { timelineIndex })

    // if (inputValue === '') {
    //   marker.name = marker.defaultName
    // }

    // else {
    //   marker.name = inputValue
    // }

    this.setState({
      editorDraftMarkers,
      editorEditingDraftMarker: null,
      editorCreatingDraftMarker: false,
    })

    this.$editable.focus()
  }

  draftMarkerLabelOnKeyDown(timelineIndex: any) {
    return (evt: any) => {
      evt.stopPropagation()
      if (evt.keyCode === 13) {
        setTimeout(() => {
          // this.saveDraftMarkerLabel(timelineIndex)
        })
      }
    }
  }

  showTimeline() {
    return this.state.editorTimelineFrames.length > 50
  }

  markerIndexFromTimelineIndex(timelineIndex: any) {
    const { editorDraftMarkers } = this.state
    return editorDraftMarkers.findIndex(({timelineIndex: index}: any) => index === timelineIndex)
  }

  deleteDraftMarker(timelineIndex: any) {
    const { editorDraftMarkers, appDrawerOpen } = this.state
    const markerIndex = this.markerIndexFromTimelineIndex(timelineIndex)
    editorDraftMarkers.splice(markerIndex, 1)
    this.setState({ editorDraftMarkers })
    if (appDrawerOpen && editorDraftMarkers.length < 1) {
      this.exitTimelineMode()
    }
  }

  focusEditableAtEnd() {
    this.$editable.focus()
    var range = document.createRange()
    range.selectNodeContents(this.$editable[0])
    range.collapse(false)
    var sel: any = window.getSelection()
    // sel.removeAllRanges()
    // sel.addRange(range)
  }

  getScrollSubject() {
    const currentFrame = this.state.editorTimelineFrames[this.state.editorTimelineIndex]
    const currentLineNumber = parseInt(currentFrame.lineNumber)
    const $currentLine = this.$editable.find('[data-line-number="' + currentLineNumber + '"]')
    const $fifthLineAbove = this.$editable.find('[data-line-number="' + (currentLineNumber - 5) + '"]')
    const $topLine = this.$editable.find('[data-line-number="0"]')

    let $subject

    if ($fifthLineAbove.length) {
      $subject = $fifthLineAbove
    }

    else if ($topLine.length) {
      $subject = $topLine
    }

    else if ($currentLine.length) {
      $subject = $currentLine
    }

    // Highlight the current line for debugging...
    // this.$editable.focus()
    // var range = document.createRange()
    // range.selectNodeContents($currentLine[0])
    // var sel: any = window.getSelection()
    // sel.removeAllRanges()
    // sel.addRange(range)

    return $currentLine
  }

  scrollCursorIntoView() {
    if (this.state.appCursorFollowing) {
      const currentFrame = this.state.editorTimelineFrames[this.state.editorTimelineIndex]

      if (currentFrame) {
        if (this.state.editorTimelineIndex / this.state.editorTimelineFrames.length > .98) {
          return
        }

        const $subject = this.getScrollSubject()

        if (this.isOutOfView($subject)) {

          autoScrollLog('needs to scroll')

          const manualScrollStopper = $('<div class="manual-scroll-stopper"></div>')

          manualScrollStopper.css({
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
          })

          this.isAutoScrolling = true

          autoScrollLog('start prescroll')

          clearTimeout(this.preAutoScrollTimeout)
          this.preAutoScrollTimeout = setTimeout(() => {

            autoScrollLog('end prescroll')

            if (this.isOutOfView($subject)) {
              autoScrollLog('starting scroll...')
              $subject[0].scrollIntoView({ behavior: 'smooth' })
            }

            else {
              autoScrollLog('checking for oops...')
              if (this.isAutoScrolling && !this.isAutoScrollingOnce) {
                // Oops! An autoscroll completed before we could detect, just kick off playback again
                autoScrollLog('oops!')
                clearTimeout(this.autoScrubTimeout)
                this.isAutoScrolling = false
                this.autoScrub()
              }
            }
          }, 300)
        }
      }

      else {
        autoScrollLog('no need to scroll')
      }
    }
  }

  doneScrollingIntoView() {

    // autoScrollLog('scrolling...')

    // this.scrollIntoViewTimeout = setTimeout(() => {
      autoScrollLog('done scrolling')

      clearTimeout(this.scrollIntoViewTimeout)
      this.$scrollable[0].removeEventListener('scroll', this.doneScrollingIntoView)

      if (this.isAutoScrolling) {
        this.isAutoScrolling = false
        $('.manual-scroll-stopper').remove()

        if (!this.isAutoScrollingOnce) {
          autoScrollLog('resuming replay')
          clearTimeout(this.autoScrubTimeout)
          this.autoScrub()
        }

        else {
          autoScrollLog('not resuming replay')
        }
      }

      else {
        autoScrollLog('was not autoscrolling just now?!')
      }
    // }, 100)
  }

  isOutOfView($line: any) {
    if (!$line.offset()) return false

    const lineTop = $line.offset().top
    const editorBottom = this.$scrollable.outerHeight() + this.$scrollable.offset().top
    const tooHigh = lineTop + $line.outerHeight() < this.$scrollable.offset().top
    const tooLow = lineTop > editorBottom - 20

    if (lineTop + $line.outerHeight() === 0) {
      this.$scrollable[0].scrollTop = this.$scrollable[0].scrollTop + 1
    }

    return tooHigh || tooLow
  }

// ================================================================================
// Render Helpers
// ================================================================================
  renderHeader() {
    const { appTitle } = this.state

    return (
      e('div', {
        className: 'title-bar'
      },
        e('div', { className: 'title' }, appTitle),
      )
    )
  }

  renderTopToolbar() {
    const { appFocusMode, editorFormatBold, editorTimelineFrames, editorFormatItalic, editorTimelineIndex, editorCreatingDraftMarker, editorDraftMarkers } = this.state
    const markerIndices = editorDraftMarkers.map((marker: any) => marker.index)

    return (
      e('div', {
        className: 'top-toolbar'
      },
        e('h1', {
          className: 'logo',
          onClick: () => this.setState({ appAboutOpen: true })
        },
          e('svg', { viewBox: '0 0 182.2 96' },
            e('path', {
              d: 'M22.51,82.3l-.53,0a11.05,11.05,0,0,1-8.62-5.16,1,1,0,0,1,.37-1.37,1,1,0,0,1,1.37.38,9,9,0,0,0,7,4.16c4.47.25,12.14-2.61,23.32-17.71C52.56,53,62.83,38.87,69.63,29.52,72.69,25.31,75,22.11,76,20.81c4.29-5.84,8.07-8.45,10.34-7.19,2,1.11,2,4.66-.17,10C85,26.52,72.68,56.76,70,62.84c-1.72,3.91-4.93,11.18-4,12.24a.93.93,0,0,0,.75.32c.46,0,1.79-.37,4.06-3.26,5.56-7,19.06-28.49,27.12-41.3,3-4.81,5.22-8.29,6.07-9.56,1.81-2.68,5.23-4.88,7.61-3.75,1.5.71,2.92,2.86,1.07,9-.52,1.76-3.35,10-6.08,17.86-2.06,6-4,11.62-4.7,13.73l-.55,1.65C99.57,65.36,97.85,70.6,98.86,72c.07.1.25.36,1,.37.93,0,2.65,0,8-9.81,6.25-11.45,13.43-25.5,17.29-33,1-2,1.81-3.55,2.27-4.44,2.71-5.2,6.24-6.46,8.64-5.9a5.24,5.24,0,0,1,3.88,5.21c0,2.05-1.42,6.6-3.27,12.36-.6,1.89-1.23,3.85-1.83,5.79-1,3.21-1.9,6.07-2.71,8.61-2.75,8.6-4.41,13.79-3.3,15.87a2.41,2.41,0,0,0,1.65,1.15c3.53,1,6.53-5.44,7.66-8.25,2.53-6.32,4.9-12.11,6.94-17.1,2.61-6.37,4.66-11.41,5.85-14.56,1.75-4.67,4.94-7.4,8.46-7.31a6.58,6.58,0,0,1,6.06,4.63c.93,2.92-.86,8.25-3.13,15l-.32,1c-1.79,5.33-3,10-4.07,14.33a6.17,6.17,0,0,0,.66,5.3,4.42,4.42,0,0,0,3.62,1.59c.53,0,1.29,0,2.09.09,1.16.06,2.48.13,3.26.1a1,1,0,1,1,.06,2c-.87,0-2.16,0-3.42-.1-.78,0-1.51-.08-2-.09A6.36,6.36,0,0,1,157,62.41c-1.34-1.73-1.7-4.22-1-7,1.06-4.33,2.3-9.09,4.11-14.49l.33-1c2-5.89,3.85-11.46,3.12-13.76A4.6,4.6,0,0,0,159.34,23h-.05c-2.64,0-5.06,2.21-6.49,6-1.2,3.18-3.26,8.23-5.87,14.61-2,5-4.4,10.78-6.93,17.09-2.85,7.12-6.43,10.47-10.07,9.43A4.37,4.37,0,0,1,127.07,68c-1.51-2.82.05-7.7,3.16-17.42C131,48,132,45.17,132.93,42c.6-1.94,1.23-3.91,1.84-5.81,1.65-5.14,3.2-10,3.17-11.7a3.24,3.24,0,0,0-2.33-3.31c-1.67-.39-4.24.69-6.41,4.87l-2.27,4.43c-3.86,7.56-11.05,21.63-17.31,33.09-5,9.18-7.32,10.9-9.82,10.86a3,3,0,0,1-2.57-1.21c-1.6-2.25-.06-6.92,2.27-14l.55-1.66c.69-2.12,2.64-7.77,4.71-13.75,2.6-7.53,5.55-16.06,6.06-17.78,1.28-4.3.83-6.26,0-6.66-1.06-.51-3.51.72-5.09,3.06-.83,1.24-3.13,4.89-6,9.51C91.59,44.75,78.06,66.24,72.43,73.38c-2.05,2.6-3.92,4-5.55,4a2.93,2.93,0,0,1-2.29-1c-1.7-1.83-.13-6,3.58-14.41,2.67-6.06,15-36.26,16.12-39.15,2.15-5.42,1.47-7.29,1.06-7.51-.67-.37-3.45.76-7.76,6.62-1,1.3-3.29,4.5-6.35,8.71-6.8,9.35-17.07,23.48-24.18,33.07C37.87,76.18,29.62,82.41,22.51,82.3Z',
            })
          ),
        ),
        e('div', { className: 'toolbar-icons' },
          // e('div', {
          //   className: 'round-icon focus-mode-toggle' + (appFocusMode ? ' active' : ''),
          //   onClick: this.toggleFocusMode,
          // }, iconFocus()),
          // e('div', {
          //   className: 'round-icon font-size-up-button',
          //   onClick: this.fontSizeUp,
          // }, iconPlus()),
          // e('div', {
          //   className: 'round-icon',
          //   onClick: this.fontSizeDown,
          // }, iconMinus()),
          // e('div', {
          //   className: 'round-icon italic-toggle' + (editorFormatItalic ? ' active' : ''),
          //   onClick: this.toggleFontFormatItalic,
          // }, iconItalic()),
          // e('div', {
          //   className: 'round-icon bold-toggle' + (editorFormatBold ? ' active' : ''),
          //   onClick: this.toggleFontFormatBold,
          // }, iconBold()),
          // e('div', {
          //   className: 'round-icon open-button',
          //   onClick: this.openFile,
          // }, iconOpen()),
          // e('div', {
          //   className: 'round-icon save-button',
          //   onClick: this.saveFile,
          // }, iconSave()),
        ),
      )
    )
  }

  renderEditor() {
    const { isPlayer } = this.props
    const { editorFontFamily, editorFontSize, editorCreatingDraftMarker, editorEditingDraftMarker, appDrawerOpen, appFocusMode, appTimelineMode, hasScrollbar } = this.state

    return (
      e('div', {
        className: 'editor' + (appTimelineMode ? ' with-timeline' : ''),
        style: {
          fontFamily: editorFontFamily,
          fontSize: editorFontSize + 'px',
        },
      },
        e(Scrollbars, {
          noScroll: !hasScrollbar,
          ref: (ref: Scrollbars) => this.scrollerInstance = ref,
          onScrollStop: () => {
            this.doneScrollingIntoView()
            autoScrollLog('component stopped scrolling')
            autoScrollLog('checking for oops...')
              if (this.isAutoScrolling && !this.isAutoScrollingOnce) {
                // Oops! An autoscroll completed before we could detect, just kick off playback again
                autoScrollLog('oops!')
                clearTimeout(this.autoScrubTimeout)
                this.isAutoScrolling = false
                this.autoScrub()
              }
          }
        },
          e('div', {
            className: 'editable' + (appDrawerOpen && !appFocusMode ? 'with-drawer' : '')
              + (appTimelineMode ? ' with-timeline' : ''),
            contentEditable: !editorCreatingDraftMarker && !editorEditingDraftMarker && !isPlayer,
          })
        )
      )
    )
  }

  renderBottomToolbar() {
    return (
      e('div', {
        className: 'bottom-toolbar'
      },
        e('div', { className: 'double-icon timeline-toggles' },
          e('div', {
            className: 'round-icon timeline-toggle' + (this.showTimeline() ? '' : ' deactivated'),
            onClick: this.toggleTimeline,
          }, iconTimeline()),
          this.renderDraftMarkerCreateIcon(),
        )
      )
    )
  }

  renderDraftMarkerCreateIcon() {
    const { editorDraftMarkers, editorTimelineIndex, editorCreatingDraftMarker, appDrawerOpen } = this.state
    const markerIndices = editorDraftMarkers.map((marker: any) => marker.timelineIndex)
    const existingMarkerIndex = markerIndices.indexOf(editorTimelineIndex)
    let markerExists = existingMarkerIndex >= 0

    // for (const index of markerIndices) {
    //   if (index > editorTimelineIndex - 10 || index < editorTimelineIndex + 10) {
    //     markerExists = true
    //     break
    //   }
    // }

    return e('div', {
      className: 'round-icon draft-marker-create'
        + ((markerExists && !editorCreatingDraftMarker) || !this.showTimeline() ? ' deactivated' : '')
        + (editorCreatingDraftMarker ? ' active' : '')
        + (appDrawerOpen && editorDraftMarkers.length < 1 ? ' shake animated' : ''),
      onMouseDown: !markerExists && !editorCreatingDraftMarker ? this.createDraftMarker : null,
    }, iconMarker())
  }

  renderDraftMarkers() {
    const { editorDraftMarkers, editorTimelineFrames, editorEditingDraftMarker, editorTimelineIndex: currentTimelinePosition, editorShowDraftMarkerLabels } = this.state

    return e('div', {
      className: 'draft-markers'
    },
      editorDraftMarkers.map(({ timelineIndex, name }: any, markerNo: any) => {
        const active = currentTimelinePosition === timelineIndex

        return e('div', {
          key: timelineIndex,
          className: 'draft-marker'
            + (editorEditingDraftMarker === timelineIndex.toString() ? ' editing' : '')
            + (active ? ' active' : '')
          ,
          style: {
            left: (timelineIndex / editorTimelineFrames.length * 100) + '%',
          },
          onClick: () => this.setPos(timelineIndex),
        },
          editorShowDraftMarkerLabels ? this.renderDraftMarkerLabel(name || 'Draft ' + (markerNo + 1), timelineIndex, false, active) : null,
        )
      })
    )
  }

  renderDraftMarkerLabel(name: any, timelineIndex: any, inDrawer: any, active?: any) {
    return e('div', {
      className: 'draft-marker-label' + (this.state.editorEditingDraftMarker === timelineIndex + (inDrawer ? '-drawer' : '') ? ' editing' : ''),
      onClick: active || inDrawer ? (evt: any) => evt.stopPropagation() : null
    },
      inDrawer ? e('em', {
        className: 'edit-icon',
        onClick: this.editDraftMarkerLabel(timelineIndex, inDrawer),
      }, iconEdit()) : null,
      e('span', {
        onClick: active && !inDrawer ? this.editDraftMarkerLabel(timelineIndex, inDrawer) : null,
      }, name),
      e('input', {
        id: 'draft-marker-' + timelineIndex + (inDrawer ? '-in-drawer' : ''),
        onKeyDown: this.draftMarkerLabelOnKeyDown(timelineIndex),
      }),
    )
  }

  renderTimeline() {
    const { isPlayer } = this.props
    const { appTimelineMode, editorTimelineIndex, editorTimelineFrames, editorShowDraftMarkers, editorPlaying } = this.state
    const value = editorTimelineIndex / editorTimelineFrames.length

    let timestamp = editorTimelineFrames[editorTimelineIndex] && editorTimelineFrames[editorTimelineIndex].timestamp
    timestamp = timestamp && moment(timestamp).format('h:mm a[\r\n]MMMM D, YYYY')

    return (
      e('div', {
        className: 'timeline' + (appTimelineMode || isPlayer ? ' open' : '') + (value < .06 ? ' left-align-slider-value' : ''),
      },
        e(Slider, {
          hideCursor: false,
          controlled: true,
          readOnly: false,
          value,
          // showDisplayValue: editorTimelineIndex < editorTimelineFrames.length - 1,
          showDisplayValue: true,
          propsDisplayValue: timestamp,
          onChange: this.sliderOnChange,
          onMouseDown: () => {
            clearTimeout(this.autoScrubTimeout)
            this.pause()
          },
        }),
        isPlayer ?
          this.renderTimelineControlsPlayer()
          : this.renderTimelineControlsApp(),
        editorShowDraftMarkers && !isPlayer ? this.renderDraftMarkers() : null,
      )
    )
  }

  renderTimelineControlsPlayer() {
    const { appDrawerOpen, editorPlaying, playerPlaybackSpeed, playerPlaybackSpeedDropOpen, editorTimelineFrames } = this.state

    return (
      e('div', { className: 'timeline-controls' },
        e('div', {
          style: { backgroundImage: `url(data:image/gif;base64,${end})` },
          className: 'round-icon timeline-button-3 end-button' + (editorPlaying ? ' playing' : ''),
          onClick: () => {
            this.pause()
            clearTimeout(this.autoScrubTimeout)
            this.setPos(editorTimelineFrames.length - 1)
            this.scrollerInstance.scrollToTop()
          },
        }),
        e('div', {
          style: { backgroundImage: `url(data:image/gif;base64,${editorPlaying ? pause : play})` },
          className: 'round-icon timeline-button-3 play-pause-button' + (editorPlaying ? ' playing' : ''),
          onClick: editorPlaying ? this.pause : this.play,
        }),
        e('div', {
          className: 'round-icon timeline-button-2 speed-selector speed--' + playerPlaybackSpeed,
        },
          e(Drop, {
            speed: playerPlaybackSpeed,
            direction: 'up',
            label: playerPlaybackSpeed + 'x',
            controlled: true,
            open: playerPlaybackSpeedDropOpen,
            setSpeed: (speed: string) => {
              this.setState({
                playerPlaybackSpeed: speed,
                playerPlaybackSpeedDropOpen: false
              })
            },
            onDropToggled: () => {
              this.setState({ playerPlaybackSpeedDropOpen: !playerPlaybackSpeedDropOpen })
            },
          }),
        ),
        // e('div', {
        //   className: 'round-icon timeline-button-1',
        //   onClick: () => {},
        // }, iconVolume2()),
        // e('div', {
        //   className: 'round-icon timeline-button-1',
        //   onClick: () => {},
        // }, iconSettings()),
      )
    )
  }

  renderTimelineControlsApp() {
    const { appDrawerOpen, editorPlaying } = this.state

    return (
      e('div', { className: 'timeline-controls' },
        e('div', {
          className: 'round-icon timeline-button-3' + (editorPlaying ? ' active' : ''),
          onClick: editorPlaying ? this.pause : this.play,
        }, iconPlay()),
        e('div', {
          className: 'round-icon timeline-button-2' + (appDrawerOpen ? ' active' : ''),
          onClick: this.toggleDrawer,
        }, iconDrawer()),
        this.renderDraftMarkerCreateIcon(),
        e('div', {
          className: 'round-icon timeline-button-1',
          onClick: () => {
            this.setState({
              appTimelineMode: false,
              appDrawerOpen: false,
            })
          },
        }, iconCloseX()),
      )
    )
  }

  renderDrawer() {
    const { appDrawerOpen, editorDraftMarkers, editorShowDraftMarkers, editorShowDraftMarkerLabels }  = this.state
    const reversedMarkers = [].concat(editorDraftMarkers).reverse()

    return (
      e('div', {
        className: 'drawer' + (appDrawerOpen ? ' open' : '')
      },
        reversedMarkers.length < 1 ?
        e('div', { className: 'empty-drawer-message' },
          e('p', {},
            e('span', {}, 'Your Drawer'),
            e('br', {}),
            e('span', {}, 'is empty!'),
          ),
          // e('p', { className: 'shake animated' }, iconMarker()),
         e('p', {},
          e('span', {}, 'Add Draft Markers'),
          e('br', {}),
          e('span', {}, 'to fill it up.'),
        ),
          // e('p', {}, 'Add Draft Markers to fill it up.'),
        )
        : reversedMarkers.map(({name, defaultName, timelineIndex}) =>
          e('div', {
            className: 'marker-list-item',
            onClick: () => this.setPos(timelineIndex),
          },
            this.renderDraftMarkerLabel(name || defaultName, timelineIndex, true),
            e('span', {
              className: 'marker-list-item-delete',
              onClick: () => this.deleteDraftMarker(timelineIndex),
            }, iconTrash())
          ),
        ),
        e('div', { className: 'marker-list-controls' },
          e('div', {
            className: 'marker-list-control',
            onClick: () => this.setState({ editorShowDraftMarkers: !editorShowDraftMarkers })
          },
            editorShowDraftMarkers ? iconCheckSquare() : iconSquare(),
            iconMarker(),
          ),
          e('div', {
            className: 'marker-list-control',
            onClick: () => this.setState({ editorShowDraftMarkerLabels: !editorShowDraftMarkerLabels })
          },
            editorShowDraftMarkerLabels ? iconCheckSquare() : iconSquare(),
            iconMessageCircle(),
          )
          // e('div', {
          //   className: 'marker-list-control',
          //   onClick: () => this.setState({ editorShowDraftMarkerLabels: !editorShowDraftMarkerLabels })
          // }, (editorShowDraftMarkerLabels ? 'Hide' : 'Show') + ' Draft Marker Labels'),
          // e('div', {
          //   className: 'marker-list-control',
          //   onClick: () => this.setState({ editorShowDraftMarkers: !editorShowDraftMarkers })
          // }, (editorShowDraftMarkers ? 'Hide' : 'Show') + ' Draft Markers'),
        ),
      )
    )
  }

  renderAbout() {
    const { appAboutOpen }  = this.state

    return (
      e('div', {
        className: 'about' + (appAboutOpen ? ' open' : '')
      },
        e('div', {
          className: 'close-x',
          onClick: () => this.setState({ appAboutOpen: false })
        }, iconCloseX()),
        e('span', {}, 'The Midst app was built by'),
        e('br'),
        e('span', {}, 'Annelyse Gelman'),
        e('br'),
        e('span', {}, 'and Jason Gillis-Grier.'),
        e('br'),
        e('span', {}, '© 2019 All Rights Reserved'),
        e('br'),
        e('br'),
        e('span', {}, "Please don't share it."),
        e('br'),
        e('span', {}, 'If you find bugs'),
        e('br'),
        e('span', {}, 'let us know at'),
        e('br'),
        e('a', { href: 'mailto:midsthq@gmail.com' }, 'midsthq@gmail.com!'),
      )
    )
  }

// ================================================================================
// Render
// ================================================================================
  render() {
    const { isPlayer } = this.props
    const { appFocusMode, editorTimelineIndex, editorTimelineFrames } = this.state

    return (
      e('div', {
        className: 'midst'
          + (appFocusMode ? ' focus-mode' : '')
          + (editorTimelineIndex < editorTimelineFrames.length - 1 ? '' : ' last-frame'),
        ref: (el) => this.el = el,
        // style: {
        //   opacity: activePlayer ? 0.2 : 1
        // }
      },
        isPlayer ? null : e('div', { id: 'about' }, this.renderAbout()),
        isPlayer ? null : e('header', { id: 'title-bar' }, this.renderHeader()),
        isPlayer ? null : e('section', { id: 'top-toolbar' }, this.renderTopToolbar()),
        e('main', {}, this.renderEditor()),
        isPlayer ? null : e('section', { id: 'bottom-toolbar' }, this.renderBottomToolbar()),
        e('section', { id: 'timeline' }, this.renderTimeline()),
        isPlayer ? null : e('aside', { id: 'drawer' }, this.renderDrawer()),
      )
    )
  }
}

export default Midst
