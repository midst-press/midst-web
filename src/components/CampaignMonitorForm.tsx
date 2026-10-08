import React, { ReactElement } from 'react'
import BaseCampaignMonitorForm from './BaseCampaignMonitorForm'

interface IProps {
  labelForName?: string
  labelForEmail?: string
  submitButtonText: string
}

// TODO: All projects: Use line breaks for all component props
function CampaignMonitorForm({
  labelForName,
  labelForEmail,
  submitButtonText,
}: IProps): ReactElement {
  return (
    <BaseCampaignMonitorForm
      id="5B5E7037DA78A748374AD499497E309E3EECC29F183831EF154D2257AF614B787A903D74C9CAC03E1390B2A291C225D35743447F5EF39FDA3E05F8B03EB44E0B"
      labelForName={labelForName}
      labelForEmail={labelForEmail}
      submitButtonText={submitButtonText}
    />
  )
}

export default CampaignMonitorForm