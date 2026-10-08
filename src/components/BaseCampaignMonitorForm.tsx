import React, { ReactElement } from 'react'

interface IProps {
  id: string
  hasNameField?: boolean
  labelForEmail?: string
  labelForName?: string | null
  onFormSubmitted?: (evt: React.SyntheticEvent<HTMLFormElement>) => void
  placeholderText?: string
  submitButtonText?: string
}

function CampaignMonitorForm({
  id,

  hasNameField = true,
  labelForEmail,
  labelForName,
  onFormSubmitted,
  placeholderText = 'Email address',
  submitButtonText = 'Submit',
 }: IProps): ReactElement {
  return (
    <div className="campaign-monitor-form">
      <form
        id={id}
        className="js-cm-form"
        method="post"
        data-id={id}
        onSubmit={onFormSubmitted}
      >
        { hasNameField && labelForName &&
          <label>{ labelForName }</label>
        }

        { hasNameField &&
          <input
            id="fieldName"
            name="cm-name"
            placeholder="Name"
            type="text"
          />
        }

        { labelForEmail &&
          <label>{labelForEmail}</label>
        }

        <input
          autoComplete="Email"
          aria-label="Email"
          id="fieldEmail"
          maxLength={200}
          name="cm-ojyuyjy-ojyuyjy"
          required
          type="email"
          placeholder={placeholderText}
          className="js-cm-email-input qa-input-email sc-iwsKbI iMsgpL"
        />

        <button type="submit">
          { submitButtonText }
        </button>
      </form>
    </div>
  )
}

export default CampaignMonitorForm
