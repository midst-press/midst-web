function getDonorList(): string[] {
  const donorList = [
    'Juliet Shafto',
    'Myrrh Crow',
    'Lara Prescott',
    'Alejandro Puyana',
  ]

  return donorList.concat(donorList).concat(donorList).concat(donorList).concat(donorList).concat(donorList)
}

export default getDonorList
